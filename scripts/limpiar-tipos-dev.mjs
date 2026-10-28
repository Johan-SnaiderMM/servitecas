// Borra los tipos que genera `next dev` (.next/dev/types). A veces quedan con basura al final (dos escrituras que se
// pisan o un servidor que se cerró de golpe) y entonces `tsc` y `next build` fallan por un archivo que nadie escribió.
// Son un archivo generado: `next dev` los vuelve a crear solo. Los tipos del build (.next/types) no se tocan.
import fs from "node:fs";

fs.rmSync(".next/dev/types", { recursive: true, force: true });
