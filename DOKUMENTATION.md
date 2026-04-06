# Favoriten Manager - Entwicklungs-Notizen

Hier sind die Lösungen für die zuletzt aufgetretenen Probleme dokumentiert:

## 1. Problem: Online-Version speichert Änderungen nicht
**Ursache:** Die Online-Version hat versucht, den lokalen Server (`localhost:3000`) zu erreichen, der im Internet nicht existiert. Zudem fehlte die Cloud-Design-Synchronisation.

**Lösung:**
*   **Speicher-Logik:** In `app.js` (`saveData`) wurde eine Fallback-Logik eingebaut: Wenn der lokale Server nicht antwortet (typisch für Online), wird stattdessen direkt die Funktion `saveToGitHub()` mit dem im Browser hinterlegten Token genutzt.
*   **Design-Sync:** Die Funktion `migrate()` wurde verbessert, damit sie nicht nur die Link-Gruppen, sondern auch die `config` (Farben, Schriften) aus der Datei liest.
*   **Themen-Aktivierung:** Beim Laden von GitHub (`loadFromGitHub`) wird jetzt explizit `applyTheme()` aufgerufen, damit das geladene Design sofort sichtbar ist.

## 2. Problem: Menü-Update auf GitHub nicht sichtbar
**Ursache:** Das Skript `publish.js` hat die neuen Dateien in einen Unterordner `/public` auf GitHub geladen. GitHub Pages zeigt jedoch standardmäßig nur die Dateien direkt im Hauptverzeichnis (Root) an.

**Lösung:**
*   Das Skript `publish.js` wurde korrigiert, sodass es die Dateien `index.html`, `style.css`, `app.js` und `ui.js` direkt in das Hauptverzeichnis deines Repositories überschreibt.

## 3. Neue Funktionen
*   **Lücken-Management:** Lücken können jetzt über den Haupt-Button "Lücke einfügen" oder pro Zeile über das Icon oben rechts verwaltet werden.
*   **Gruppen-Erstellung:** In jeder Lücke gibt es jetzt ein `+` Icon, um eine Gruppe direkt an dieser Stelle zu erzeugen.
*   **Verschieben-Modus:** Ermöglicht Batch-Verschiebungen von Elementen per Klick-Auswahl.

---
*Letztes Update: 04.04.2026 - Antigravity AI*

## 4. Problem: Drag & Drop Instabilität (Gruppen & Links)
**Ursache:** Beim Verschieben von Gruppen oder Links "auf die Grenze" oder in leere Lücken (Spacers) traten Datenverluste auf (Gruppen verschwanden). Zudem blockierte die Absicherung gegen versehentliches Gruppen-Verschieben das Sortiersystem (SortableJS) für einzelne Links.

**Lösung:**
*   **Safe-Drop für Gruppen:** In `handleRowDrop` wurde ein Vorab-Check eingebaut. Die Gruppe wird erst aus der alten Position gelöscht (`findProjectAndClear`), wenn ein gültiger Ziel-Slot gefunden wurde. Bei ungültigem Drop (z.B. außerhalb des Grids) bleibt die Gruppe an ihrem Platz.
*   **Sperrung der Lücken:** Während ein Link (Favorit) verschoben wird, wird eine globale Klasse `.is-dragging-item` auf dem Body gesetzt. Dadurch reagieren die Lücken (Spacers) nicht mehr auf den Drag-Vorgang und können den Link nicht fälschlicherweise "verschlucken".
*   **Drag-Isolation:** Die native Drag-Funktion der Spalten (`ondragstart`) wurde so angepasst, dass sie nur feuert, wenn *nicht* auf einen Favoriten-Link geklickt wurde. Dies erlaubt es SortableJS, die Links zu bewegen, ohne dass der Browser gleichzeitig versucht, die ganze Gruppe zu verschieben.
*   **Zwangssynchronisierung:** Nach jedem Drag-Vorgang (auch bei Fehlern) wird nun `renderBoard()` aufgerufen, um den DOM-Zustand zu 100% mit dem internen Datenstand abzugleichen.

## 5. Neue Komfort-Funktionen (v3.x)
*   **Externes Drag & Drop:** Links können jetzt direkt von anderen Webseiten oder Browser-Tabs auf Gruppen gezogen werden.
*   **Zwischenablage-Import:** Per Rechtsklick auf eine Gruppe kann ein kopierter Link direkt eingefügt werden (inkl. Automatik-Fallback bei Browser-Sperren).
*   **Auto-Name Cleaning:** Links werden beim Einfügen automatisch bereinigt (Entfernung von `http://`, `www.` und Kürzung nach der Domain wie `.com` oder `.de`), um saubere Titel zu erhalten.
*   **Link-Bearbeitung:** Der Bleistift-Button an Favoriten ermöglicht das schnelle Ändern von Titel und URL.

---
*Letztes Update: 05.04.2026 - Antigravity AI*

## 6. Problem: Smartphone-Sperre & Read-Only Modernisierung (v4.x)
**Ursache:** In der öffentlichen Version ("Nur Lesen") traten zwei Hauptprobleme auf: 
1.  **Mobile-Blockade:** Die Drag-and-Drop-Bibliothek (`SortableJS`) war auf dem Handy aktiv. Jede Berührung eines Links löste ein winziges "Verschieben"-Event aus, das beim Loslassen ein automatisches `saveData()` triggerte. Da ohne Token nicht gespeichert werden kann, erschien sofort die Fehlermeldung/Token-Abfrage, bevor der Link aufgehen konnte.
2.  **Versehentliche Bearbeitung:** In der Read-Only Ansicht konnten Besucher (oder man selbst auf dem Handy) versehentlich in Textfelder klicken, was einen Cursor (Caret) anzeigte und beim Verlassen ebenfalls Speicher-Prompts auslöste.

**Lösung:**
*   **Nur-Lese-Statik:** Alle interaktiven Eingabefelder (Zeilennamen, Sortiernummern) werden im Read-Only Modus nun durch rein statische `<span>`-Elemente ersetzt. Ein Hineinklicken oder Löschen von Text ist technisch unmöglich.
*   **SortableJS-Sperre:** Die Drag-and-Drop-Funktion wird im Read-Only Modus jetzt global deaktiviert (`disabled: true`). Dadurch reagiert das Handy wieder ganz normal auf Klicks, ohne "Verschiebe-Interferenzen".
*   **Aktions-Bereinigung:** Alle Bearbeitungs-Buttons (`Löschen`, `Bearbeiten`, `+`) werden im Lese-Modus gar nicht erst im HTML-Code gerendert.
*   **Mobile-Optimierte Links:** Die Links wurden von JavaScript (`window.open`) auf echte HTML-Anker (`<a>`) umgestellt, was die Zuverlässigkeit auf Smartphones (iOS/Android) massiv erhöht, da sie nicht mehr als Pop-ups geblockt werden.
*   **Cache-Busting:** Um sicherzustellen, dass Handys nicht alte (fehlerhafte) Versionen laden, wurde eine Versionierung (`?v=4.8`) an alle Skripte und Stylesheets angehängt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 7. Problem: "Mehrere Löschen" funktionierte nicht für Gruppen
**Ursache:** Beim Auswählen mehrerer Elemente (Links und Ordner/Gruppen) über den "Mehrere Löschen"-Modus trat ein Fehler auf, wenn der Benutzer auf "Auswahl löschen" klickte. Die dahinterliegende Funktion `applyDelete` nutzte intern ausnahmslos `findItemAndClear(id)`. Diese Suchfunktion war jedoch strikt darauf programmiert, nur in die tiefste Ebene (die Links/Items) zu schauen. Wenn das System eine ID erhielt, die zu einer Favoriten-Gruppe (Ordner) gehörte, fand es nichts (`null`), ignorierte die Objekt-ID und löschte folglich den Ordner nicht.
Zudem existierte die Funktion `findItemAndClear` fälschlicherweise als identisches Duplikat doppelt im Code.

**Lösung:**
*   **Erweiterte Erkennung beim Löschen:** Die Ausführungs-Funktion `applyDelete` wurde so umgeschrieben, dass sie zweistufig arbeitet: Sie prüft zuerst, ob es sich bei der angewählten ID um einen einzelnen Link handelt (`findItemAndClear(id)`). Falls dieser Versuch fehlschlägt, führt das System stattdessen direkt im Anschluss `findProjectAndClear(id)` aus, um die komplette Favoriten-Gruppe/Ordner aus der Liste zu entfernen.
*   **Wortlaut-Anpassung:** Da nun Gruppen und Links parallel im Massenverfahren bearbeitet werden können, wurde die Terminologie im "Mehrere Löschen"-Zähler in der Werkzeugleiste sowie im Bestätigungs-Popup von "X Favoriten" auf "X Elemente" allgemeingültig angepasst.
*   **Code-Bereinigung:** Die überflüssige, ungenutzte zweite Deklaration von `findItemAndClear` am Ende der `app.js` wurde restlos entfernt, um künftigen Fehlern bei der Code-Pflege vorzubeugen.

## 8. Stabilisierung: GitHub-Speichern bei SHA-Konflikten (v4.9)
**Ursache:** Beim Speichern über die GitHub API konnte der Upload fehlschlagen, wenn die lokal gehaltene `ghSha` veraltet war (typisch bei parallelen Änderungen oder nach längerer Session). Zusätzlich war die Base64-Umwandlung über `escape/unescape` anfällig bei Sonderzeichen.

**Lösung:**
*   **SHA-Retry-Strategie:** `saveToGitHub()` lädt bei fehlender SHA zunächst Metadaten (`fetchGitHubFileMeta`) und wiederholt den Upload bei `409/422` automatisch mit der aktuellen SHA.
*   **Unicode-sichere Kodierung:** Die GitHub-Content-Kodierung wurde auf UTF-8 mittels `TextEncoder`/`TextDecoder` umgestellt (mit Fallback), damit Umlaute und Sonderzeichen stabil gespeichert/geladen werden.
*   **Verbessertes Logging:** Fehlertexte aus der GitHub API werden jetzt protokolliert, um Ursachen schneller zu erkennen.

---
*Letztes Update: 06.04.2026 - Antigravity AI*
