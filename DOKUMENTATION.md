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

## 32. Neuer Modus: Multi Copy (Gruppen in neue Zeile kopieren)
**Umsetzung:**
*   Neuer Header-Button **"Multi Copy"**.
*   Mehrere Gruppen koennen markiert und gesammelt in eine **neue Zeile** kopiert werden.
*   Eigene Copy-Toolbar mit Zaehler, Abbrechen und "In neue Zeile kopieren".
*   Beim Kopieren wird der Zeilenname abgefragt; Gruppen und enthaltene Favoriten werden als Kopie neu angelegt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 31. Bestätigungsdialog per Enter-Taste
**Umsetzung:**
*   Im zentralen Confirm-Modal (`showConfirm`) kann jetzt mit **Enter** bestätigt werden.
*   Optional: **Escape** entspricht Abbrechen.
*   Keydown-Listener wird beim Schließen sauber entfernt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 30. Löschdialog für letzte Gruppe in einer Lücke
**Umsetzung:**
*   Beim Löschen einer Gruppe wird jetzt erkannt, ob sie die letzte Gruppe im Slot/Lücke war.
*   In diesem Fall erscheint ein zweiter Dialog: **"Leere Lücke auch löschen?"**
*   Bei Bestätigung wird der leere Slot direkt mit entfernt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 29. Fix: Mailclient-Artefakte im E-Mail-Import (Quoted-Printable/Boundary)
**Ursache:** Einige Mailclients liefern den Body mit Quoted-Printable-Umbruechen (`=\n`), Hex-Escapes und MIME-Boundary-Fragmenten. Dadurch konnte der Gruppenname mit Header-Resten verunreinigt werden.

**Lösung:**
*   Parser dekodiert Quoted-Printable (`=\n`, `=XX`) vor der Analyse.
*   Gruppenfeld wird gegen Header-/Boundary-Fragmente bereinigt (`DATE|`, `FORMAT|`, `FAVORITEN-CACHE-EXPORT|`, `----=_...`).
*   Ergebnis: Titel/URL/Gruppen werden stabil getrennt, auch bei problematischen Mailformaten.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 28. Fix: E-Mail-Import vertauschte teils Titel/URL bei kompaktem Mailtext
**Ursache:** Manche Mailclients liefern den Export als eine lange Zeile (ohne saubere Umbrueche). Der Parser konnte dadurch Header-/Nutzdaten vermischen.

**Lösung:**
*   Parser auf robustes Tuple-Matching erweitert (`TITLE|URL|GROUP`) auch fuer Ein-Zeilen-Text.
*   Header-Zeilen (`FAVORITEN-CACHE-EXPORT|...`, `DATE|...`, `FORMAT|...`) werden sauber ignoriert.
*   URL-Feld wird validiert; ungueltige/leerere URL-Zeilen werden nicht importiert.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 27. E-Mail-Import mit Zwischenschritt "Auswahl"
**Umsetzung:**
*   Nach Einfuegen des E-Mail-Texts fuehrt der Button **Weiter** in ein Auswahlfenster.
*   Dort koennen Favoriten einzeln per Checkbox ein/ausgeschaltet werden.
*   Duplikate werden markiert und mit Fundorten (`Zeile / Gruppe`) angezeigt.
*   Erst nach Klick auf **Ausgewaehlte importieren** wird wirklich importiert.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 26. E-Mail-Import: Ziel vorab bestimmen (Zeile/Gruppe)
**Umsetzung:**
*   Im Dialog **Import E-Mail** kann vor dem Import das Ziel gewaehlt werden:
    * Auto (wie bisher)
    * Neue Zeile erstellen
    * In bestehende Zeile importieren
    * In bestehende Gruppe importieren
*   Bei Ziel **Zeile** werden Gruppen anhand des Gruppennamens in dieser Zeile gemerged/angelegt.
*   Bei Ziel **Gruppe** werden alle importierten Links direkt in diese eine Gruppe geschrieben.
*   Duplikatpruefung bleibt aktiv (URL-basiert) und reportet weiterhin Fundorte.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 25. Neuer Button: "Import E-Mail" mit Duplikatpruefung
**Umsetzung:**
*   Neuer Header-Button **"Import E-Mail"** oeffnet einen Import-Dialog.
*   Import moeglich per Copy/Paste oder Drag&Drop aus Mailprogramm (Text oder Datei-Inhalt).
*   Parser erwartet den Mail-Only-Export (`FAVORITEN-CACHE-EXPORT|v1`, `TITLE|URL|GROUP`).
*   Vor dem Einfuegen wird gegen lokale Favoriten auf URL-Basis geprueft.
*   Duplikate werden uebersprungen und mit Fundort (`Zeile / Gruppe`) im Report angezeigt.
*   Nicht vorhandene Gruppen werden automatisch in einer Zeile **"Mail Import"** angelegt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 24. Neuer Button: "Nur E-Mail" (ohne Datei)
**Umsetzung:**
*   Neuer Header-Button **"Nur E-Mail"** fuer den Cache-Export ohne HTML/TXT-Datei.
*   Es wird direkt ein `mailto:`-Entwurf erzeugt.
*   Der Mailtext nutzt ein stabiles Import-Format (`FAVORITEN-CACHE-EXPORT|v1`, dann `TITLE|URL|GROUP` je Zeile).
*   Wegen Mailclient-Laengenlimit werden maximal 120 Eintraege in den Body geschrieben (mit Hinweis bei Kuerzung).

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 23. Neuer Button: Browser-Cache loeschen (ohne Token)
**Umsetzung:**
*   Neuer Header-Button **"Cache loeschen"**.
*   Loescht lokal `favoriten_backup` (Board-Cache) und `favoriten_cached_items_for_mail` (Mail-Cache).
*   Im Browser-Cache-Modus wird danach der Online-Stand frisch neu geladen.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 22. Ohne Token: Zeilen/Gruppen/Favoriten lokal bearbeitbar
**Ziel:** Im Buero-Browser ohne GitHub-Token trotzdem komplett weiterarbeiten.

**Umsetzung:**
*   Read-Only wurde in einen echten Browser-Cache-Modus erweitert: Bearbeitung ist ohne Token erlaubt.
*   Gilt fuer Zeilen, Gruppen und Favoriten (inkl. Kontextmenue/Buttons).
*   Speicherung erfolgt lokal im Browser (`favoriten_backup`).
*   Beim oeffentlichen GitHub-Load wird vorhandener lokaler Backup-Stand bevorzugt geladen.
*   Statusanzeige zeigt im Header: **Browser-Cache Modus**.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 21. Gruppe hinzufuegen per Mausposition: bestehende Gruppen bleiben erhalten
**Ursache:** Beim Einfuegen ueber Zeilen-Kontextmenue wurde eine neue Gruppe teils als neuer Slot angelegt, statt im angeklickten Slot unter vorhandenen Gruppen einzusortieren.

**Lösung:**
*   Mausziel-Slot wird aus der Kontextmenue-Position erkannt.
*   Wenn ein Slot getroffen wird, wird die neue Gruppe in diesem Slot **unten angehaengt**.
*   Vorhandene Gruppen im Slot bleiben unveraendert.
*   Nur wenn kein Slot getroffen wird, wird ein neuer Slot an der Einfuegeposition erzeugt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 20. Gruppen-Erstellung per Rechtsklick jetzt positionsgenau
**Ursache:** "Gruppe hinzufuegen" im Zeilen-Kontextmenue setzte neue Gruppen immer ans Ende der Zeile.

**Lösung:**
*   Beim Oeffnen des Kontextmenues wird die Mausposition gespeichert.
*   `addSlotToRow` und `addRowSpacer` berechnen daraus den Insert-Index innerhalb der Zeile.
*   Neue Gruppe/Luecke wird dadurch an der Position der Rechtsklick-Stelle eingefuegt, nicht pauschal am Ende.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 19. Cache-Export erweitert: HTML oder TXT
**Umsetzung:**
*   Beim Button **"Cache per E-Mail"** kann jetzt das Dateiformat gewaehlt werden: `.html` oder `.txt`.
*   Danach wird die Datei lokal erzeugt und ein `mailto:`-Entwurf geoeffnet.
*   Anhang bleibt manuell (Browser-Sicherheitsgrenze), Vorschau wird in den Mailtext geschrieben.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 18. Offline/No-Token Workflow: Cache + E-Mail Export
**Ziel:** Auf Fremd-PCs ohne Token trotzdem Favoriten erfassen und spaeter nach Hause mitnehmen.

**Umsetzung:**
*   Beim Hinzufuegen in Read-Only ohne Token werden neue Favoriten lokal in einer Cache-Liste gespeichert (`favoriten_cached_items_for_mail`).
*   Neuer Header-Button **"Cache per E-Mail"** erstellt aus der Cache-Liste eine HTML-Datei und oeffnet einen E-Mail-Entwurf.
*   Die HTML-Datei wird lokal heruntergeladen (als Anhang fuer die Mail nutzbar), im Entwurf steht zusaetzlich eine Text-Vorschau.
*   Optional kann die Cache-Liste nach dem Senden geleert werden.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 17. Bookmarklet-Fix + Nutzung ohne Token
**Ursache:** Der Bookmarklet-Aufruf kam mit `projectId = null`, dadurch wurde der Favorit nicht zugeordnet. In Browsern ohne Token fehlte zudem klares Feedback zur Speicherung.

**Lösung:**
*   `addItem()` fragt bei fehlender Zielgruppe jetzt per Auswahl-Dialog nach der Gruppe.
*   Speichern ohne Token bleibt moeglich (lokale Browser-Sicherung im Browser-Cache).

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 33. Multi Copy erweitert: Zielzeile auswählbar
**Umsetzung:**
*   `Multi Copy` kann nun wahlweise in **neue Zeile** oder direkt in eine **bestehende Zeile** kopieren.
*   Die Auswahl zeigt alle vorhandenen Zeilen mit Namen + Ordnungsnummer.
*   Zusätzlich wurde im Zeilen-Kontextmenü `Zeile mit Inhalt kopieren` ergänzt (komplette Zeile inkl. Gruppen/Favoriten).

---
*Letztes Update: 07.04.2026 - Antigravity AI*

## 34. UI-Verbesserungen (Lesbarkeit + Bedienung)
**Umsetzung:**
*   Schrift insgesamt vergrößert (`html { font-size: 17px; }`).
*   Import-Dialoge (`Import E-Mail`, Auswahlfenster) vergrößert und mit besser lesbaren Schriftgrößen versehen.
*   `Link bearbeiten` Dialog erhielt größere Typografie für bessere Lesbarkeit.
*   Confirm-Dialog akzeptiert Enter (Bestätigen) und Escape (Abbrechen).

---
*Letztes Update: 07.04.2026 - Antigravity AI*

## 35. Gruppen-/Zeilen-UX: neue Schnellaktionen
**Umsetzung:**
*   Gruppenkopf hat nun neben `+` einen Bleistift zum Umbenennen.
*   Zeilenkopf hat ebenfalls einen Bleistift zum Umbenennen.
*   Beim Löschen der letzten Gruppe in einer Lücke erscheint optional: `Leere Lücke auch löschen?`.

---
*Letztes Update: 07.04.2026 - Antigravity AI*

## 36. Layout- und Drag-Fixes
**Umsetzung:**
*   Lücke/Slot-Einfügen per Maus berücksichtigt jetzt X+Y und trifft die visuelle Zielposition korrekt.
*   Beim Gruppen-Drag wird Textselektion unterdrückt (kein Markieren von Gruppentiteln mehr).
*   Leere Gruppen zeigen keinen weißen Streifen mehr (`.column-body:empty`).
*   Gruppen-Umrandung auf Farbe des Gruppenkopfes angepasst.
*   Abstand zwischen Gruppen innerhalb desselben Slots erhöht.
*   No-Token-Browseransicht zeigt keine unnötigen "nicht möglich"-Hinweise mehr.

---
*Letztes Update: 07.04.2026 - Antigravity AI*

## 14. Zeilen-Nummer wiederhergestellt + Sortierlogik korrigiert
**Ursache:** Die sichtbare Zeilen-Nummer im Header war nicht mehr gerendert. Der Button "Zeilen sortieren" hat zudem die vom Benutzer gesetzten Nummern wieder auf `10,20,30...` normalisiert.

**Lösung:**
*   Zeilen-Nummer (`row-order-input`/`row-order-display`) wieder im Zeilenkopf eingeblendet.
*   `sortRows()` sortiert jetzt nur nach bestehender Nummer, ohne anschließendes Neu-Nummerieren.
*   Ergebnis: Manuelle Zeilen-Nummern bleiben erhalten und steuern die Sortierung korrekt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 15. Slot/Lücken-Nummern für Verschiebe-Ziele
**Ursache:** Für Kontextmenü-Aktionen war die Zielangabe "Zeile + Lücke" nicht ausreichend sichtbar, da Nummern nur auf echten Spacern und teils schlecht erkennbar waren.

**Lösung:**
*   Sichtbare Slot-Nummern `#1, #2, ...` pro Zeile eingeführt.
*   Anzeige gilt jetzt auch bei gefüllten Slots (nicht nur leeren Lücken).
*   Positionierung der Nummer wurde nach außen links oben verlegt (Badge außerhalb der Kachel), damit sie den Inhalt nicht überdeckt.
*   Kontextmenü "Gruppe verschieben..." nutzt diese Zielstruktur: `Zeilenname / Luecke N`.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 16. Kontextmenü-Schließen nach Aktion stabilisiert
**Ursache:** Bei bestimmten Aktionen (z. B. "Favorit aus Arbeitspeicher") blieb das Kontextmenü sichtbar.

**Lösung:**
*   Im Kontextmenü wird bei Klick auf einen `.context-menu-item` sofort geschlossen.
*   Der globale Outside-Click-Handler wird dabei sauber abgeräumt.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 13. Neue Funktion: Favorit aus Arbeitspeicher (Rechtsklick-Menue)
**Umsetzung:**
*   Im Gruppen-Kontextmenue gibt es jetzt **"Favorit aus Arbeitspeicher"**.
*   Die Funktion liest Text aus der Zwischenablage, extrahiert eine URL und fuegt den Favoriten in die gewaehlte Gruppe ein.
*   Der Titel wird nach den bestehenden Regeln ueber `cleanTitle()` vorgeschlagen (inkl. Domain-Endungs-Bereinigung).

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 12. UI-Verbesserung: Native Prompt-Fenster durch Design-Dialoge ersetzt
**Umsetzung:**
*   Native Browser-`prompt()` wurde in den Hauptflows durch eigene Modale ersetzt (`input-modal`, `select-modal`).
*   Betrifft: Favorit hinzufuegen/bearbeiten, Gruppe in Luecke erstellen, Favorit per Kontextmenue in Zielgruppe verschieben.
*   Die Gruppenauswahl hat jetzt Suche + Doppelklick/Enter fuer schnellere Bedienung.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 11. Neue Funktion: Einzelnen Favoriten per Rechtsklick in Gruppe verschieben
**Umsetzung:**
*   Im Kontextmenü eines Favoriten gibt es jetzt den Eintrag **"Verschieben in Gruppe..."**.
*   Nach Klick erscheint eine Auswahl-Abfrage mit allen Zielgruppen.
*   Der Favorit wird danach direkt in die gewählte Gruppe verschoben und gespeichert.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 10. Problem: "Namen bereinigen" ließ Domain-Endungen stehen
**Ursache:** Die Bereinigung nutzte zuvor teils den bestehenden Titel statt der URL. Außerdem wurde nur auf Pfad/Query gekürzt, nicht auf die Domain-Endung. Dadurch blieben z. B. `.de`, `.ch`, `.com` im Titel sichtbar.

**Lösung:**
*   **URL als Primärquelle:** `cleanAllLinkTitles` nutzt jetzt zuerst `it.url` (Fallback nur wenn URL fehlt).
*   **TLD-Entfernung:** `cleanTitle` entfernt Domain-Endungen wie `.de`, `.ch`, `.com` sowie mehrteilige Endungen wie `co.uk`/`com.au`.
*   **Ergebnis:** Aus `https://www.google.de/search` wird `Google`.

---
*Letztes Update: 06.04.2026 - Antigravity AI*

## 9. Problem: Move-Mode verschiebt nur ein Element + reduziertes Rechtsklick-Menü
**Ursache:** Im Move-Mode wurde beim Drag-Drop nur das aktiv gezogene Item verarbeitet. Vorselektierte weitere Favoriten in `selectedIds` wurden ignoriert. Zusätzlich war das Kontextmenü auf wenige Einträge reduziert und im Move-Mode am Gruppen-Header teilweise blockiert.

**Lösung:**
*   **Batch-Move beim Drag:** In `app.js` wurde eine zentrale Mehrfach-Logik (`moveSelectedItemsToProject`) eingebaut. Im Move-Mode werden jetzt alle markierten Favoriten in einem Zug verschoben (inkl. stabiler Reihenfolge und korrektem Zielindex).
*   **Fallback-Verhalten:** Wird ohne passende Vorselektion gezogen, behandelt das System den gezogenen Favoriten automatisch als Einzel-Auswahl.
*   **Verschieben-Button repariert:** `btn-confirm-move` ist jetzt verdrahtet (`ui.js`) und nutzt `applyMove()`; Zielgruppe kann per Rechtsklick gesetzt werden.
*   **Kontextmenü erweitert:** Zusätzliche Einträge für Zeile/Gruppe/Favorit wurden ergänzt (u.a. Lücke hinzufügen, Zielgruppe setzen, Auswahl markieren).
*   **Toolbar-Status:** Move-/Delete-Toolbar zeigen wieder korrekte Zählertexte und aktivieren den Verschieben-Button nur bei gültiger Auswahl + Ziel.

---
*Letztes Update: 06.04.2026 - Antigravity AI*
