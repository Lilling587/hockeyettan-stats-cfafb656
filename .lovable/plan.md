Kopiera både namn och nummer från försäsongstruppen

Bakgrund
I admin/vmix-kortet "Försäsong" finns en lista med spelare (nummer, namn, position). Varje rad har en kopiera-knapp som idag bara kopierar spelarens namn. Användaren vill kunna kopiera både namn och nummer på samma gång så att det går att klistra in båda värdena direkt i laguppställningen.

Ändring
Uppdatera kopiera-knappen i försäsongstruppslistan i `src/routes/_authenticated/admin.vmix.tsx` så att den skriver en kombinerad text till urklipp, t.ex. `"12 John Doe"` eller `"John Doe #12"`, beroende på vilket format som passar bäst för vidare inklistring i lineupfälten. Uppdatera samtidigt knappens `aria-label` och `title` så att det tydligt framgår att både nummer och namn kopieras.

Fil(er)
- `src/routes/_authenticated/admin.vmix.tsx` (PreseasonRosterCard-komponenten)

Kontrollera
- Knappen kopierar nummer + namn för spelare som har ett nummer.
- Spelare utan nummer faller tillbaka på att bara kopiera namnet.
- `aria-label` och `title` är uppdaterade.
- TypeScript och bygget valideras utan fel.
