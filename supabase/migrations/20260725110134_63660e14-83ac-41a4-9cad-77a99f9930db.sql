-- Trigger som skapar en profil-rad automatiskt när ny användare registreras
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

-- Backfill: skapa profiler för befintliga användare som saknar en
INSERT INTO public.profiles (id, email, approval_status)
SELECT u.id, u.email, 'pending'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;