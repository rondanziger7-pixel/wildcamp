<!-- Research memo, read 2026-10-06. It backs src/wildlife.ts (HUNT_2026, huntingNote): the main hunting periods of 2026 as the cantons published them, the days a canton
     does not hunt, and the general statement for every other canton and year. Official advice to hikers about hunting was NOT found, so none is given. -->

# r1 (b): Hunting seasons, federal frame and cantonal 2026 periods

Researcher memo for Wildcamp CH. All pages read on **2026-10-06** (UTC) via `curl` (HTML to text, PDFs via `pdftotext -layout`, cantonal law portals through their JSON API). Repo not edited. Quotes are verbatim from the document named. Notes in the scratchpad: `/tmp/claude-0/-home-user-wildcamp/2dad72b0-e170-5b8a-8edb-d172ada10a4c/scratchpad/hunt_notes.md` (running quotes) and `.../raw/hunt/` (downloads).

## 0. Two corrections to the brief

1. **JSV Art. 2 is not about seasons.** In the current JSV (SR 922.01, consolidation of **2026-01-01**) Art. 2 is titled "Für die Jagd verbotene Hilfsmittel". The species-by-species **closed seasons (Schonzeiten)** are in **JSG Art. 5** (Jagdgesetz, SR 922.0, consolidation of 2025-02-01), and the JSV only changes a few of them in **Art. 3bis**. The federal law fixes *closed* seasons only; the cantons choose the actual hunting periods inside the open window (JSG Art. 3 para. 2, Art. 5 para. 4).
2. **Hunting is not one nationwide "main hunt".** Some cantons run a patent hunt with a defined September main hunt (GR, VS, BE, UR, GL, SZ, OW, NW, AI, AR, FR, VD, ZG, TI); JU and NE run their main hunt from October (with a few chamois days in September). Others (SG, LU, ZH, TG, AG, SO, BL, SH) run revier hunts whose dates are set by rule over many months.

## 1. Federal frame (primary text, read from fedlex)

Sources (PDF, `pdftotext`, read 2026-10-06):
- JSG: https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1988/506_506_506/20250201/de/pdf-a/fedlex-data-admin-ch-eli-cc-1988-506_506_506-20250201-de-pdf-a.pdf (a SPARQL query on https://fedlex.data.admin.ch/sparqlendpoint shows 2025-02-01 is the newest consolidation, no end date)
- JSV: https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1988/517_517_517/20260101/de/pdf-a/fedlex-data-admin-ch-eli-cc-1988-517_517_517-20260101-de-pdf-a.pdf (newest consolidation 2026-01-01, no end date)

**JSG Art. 5 (Jagdbare Arten und Schonzeiten), para. 1** "Die jagdbaren Arten und die Schonzeiten werden wie folgt festgelegt:" (each entry is the closed season):

| Species | Schonzeit (verbatim) | Huntable window (my arithmetic) |
|---|---|---|
| a. Rothirsch | "vom 1. Februar bis 31. Juli" | 1 Aug to 31 Jan |
| b. Wildschwein | "vom 1. Februar bis 30. Juni" (changed by JSV Art. 3bis para. 2 let. a, see below) | 1 Jul to end Feb |
| c. Damhirsch, Sikahirsch und Mufflon | "vom 1. Februar bis 31. Juli" | 1 Aug to 31 Jan |
| d. Reh | "vom 1. Februar bis 30. April" | 1 May to 31 Jan |
| e. Gämse | "vom 1. Januar bis 31. Juli" | 1 Aug to 31 Dec |
| f. Feldhase, Schneehase und Wildkaninchen | "vom 1. Januar bis 30. September" | 1 Oct to 31 Dec |
| g. Murmeltier | "vom 16. Oktober bis 31. August" | 1 Sep to 15 Oct |
| h. Fuchs | "vom 1. März bis 15. Juni" | 16 Jun to end Feb |
| i. Dachs | "vom 16. Januar bis 15. Juni" | 16 Jun to 15 Jan |
| k. Edelmarder und Steinmarder | "vom 16. Februar bis 31. August" | 1 Sep to 15 Feb |
| l. Birkhahn, Schneehuhn und Rebhuhn | "vom 1. Dezember bis 15. Oktober" | 16 Oct to 30 Nov |
| m. Ringeltaube, Türkentaube, Kolkrabe und Nebelkrähe | "vom 16. Februar bis 31. Juli" | 1 Aug to 15 Feb |
| n. Fasan | "vom 1. Februar bis 31. August" | 1 Sep to 31 Jan |
| o. Haubentaucher, Blässhuhn, Kormoran und Wildenten | "vom 1. Februar bis 31. August" (Kormoran: JSV below) | 1 Sep to 31 Jan |
| p. Waldschnepfe | "vom 15. Dezember bis 15. September" | 16 Sep to 14 Dec |

- Para. 3: "Während des ganzen Jahres können gejagt werden: a. Marderhund, Waschbär und verwilderte Hauskatze; b. Rabenkrähe, Elster, Eichelhäher und verwilderte Haustaube." (JSV Art. 3bis para. 2 let. c then sets a closed season of 16 Feb to 31 Jul for Rabenkrähe, Saatkrähe, Elster and Eichelhäher.)
- Para. 4: "Die Kantone können die Schonzeiten verlängern oder die Liste der jagdbaren Arten einschränken. Sie sind dazu verpflichtet, wenn der Schutz örtlich bedrohter Arten dies erfordert."
- JSG Art. 3 para. 2: the cantons "legen das Jagdsystem und das Jagdgebiet fest". Art. 4 para. 1: "Wer jagen will, braucht eine kantonale Jagdberechtigung."
- **JSV Art. 3bis para. 2** (Schonzeiten "beschränkt oder erweitert"): "a. Wildschwein: Schonzeit vom 1. März bis 30. Juni; für Wildschweine, welche jünger als zweijährig sind, gilt ausserhalb des Waldes keine Schonzeit; b. Kormoran: Schonzeit vom 1. März bis 31. August; c. Rabenkrähe, Saatkrähe, Elster und Eichelhäher: Schonzeit vom 16. Februar bis 31. Juli ...". Para. 1: "die Moorente und das Rebhuhn sind geschützt; die Saatkrähe ist jagdbar."
- **JSV Art. 3ter (Nachtjagdverbot):** "Im Wald ist die Jagd während der Nacht verboten; ausgenommen ist die Passjagd." (para. 2: cantons may allow exceptions "für die Verhütung von Wildschaden").
- **JSV Art. 2 (for the record):** "Für die Jagd verbotene Hilfsmittel" (traps, snares, night-vision sights, etc.). Para. 1 let. o lists "zivile, unbemannte Luftfahrzeuge, ausser zum Einsatz durch fachkundige Personen für die Rehkitzrettung" as a forbidden hunting aid; that is about hunters, not about recreational drones.

Federal windows are the legal maximum. They say nothing about a "Hochjagd", daily hours or rest days; those are cantonal (section 2 and 3).

## 2. Cantonal periods for 2026

Legend: **Y** = dates published for 2026 (year-specific); **R** = rule or calendar formula in law, not year-specific; read means I read the page or document myself.

### Summary
| Canton | Main-hunt dates for 2026 found | Type | Status |
|---|---|---|---|
| GR | Hochjagd 3 to 13 Sep and 21 to 30 Sep | Y | verified (law + page) |
| VS | Opening 21 Sep; permit A 21 Sep to 3 Oct | Y | verified (law text) |
| BE | Rothirsch main hunt 1 to 20 Sep, Nachjagd 10 Oct to 15 Nov, Sonderjagd 23 Nov to 5 Dec | Y | verified (Jagdordnung 2026/27) |
| TI | Caccia alta 5 to 19 Sep and 23 to 27 Sep | Y | verified (canton page) |
| SG | third Saturday Aug to third Saturday Dec | R | verified (law) |
| UR | Hochwild 7 to 19 Sep, Hirsch 28 to 30 Sep, Niederwild 12 Oct to 30 Nov | Y | verified (page) |
| GL | Hochwild 7 to 21 Sep, Schalenwild October 1 to 21 | Y | verified (Jagdvorschriften 2026) |
| SZ | Hochwild 1 to 19 Sep, 2nd Rotwild window in Nov | Y | verified (annual rules) |
| OW | Hochjagd 1 to 24 Sep, Rehjagd 5 to 24 Oct, Niederjagd 5 Oct to 30 Nov | Y | verified (page) |
| NW | Hochjagd 1 to 22 Sep, Niederjagd 15 Oct to 30 Nov | Y | verified (press release) |
| AI | Hochwildjagd 7 Sep to 3 Oct, Niederwild 5 Oct to 14 Nov | Y | verified (law annex) |
| AR | Hochjagd 1 to 19 Sep, 2nd Rotwild 9 Nov to 5 Dec | Y | verified (page) |
| FR | chamois 21 Sep to 3 Oct, roe 21 Sep to 17 Oct, red deer 19 to 31 Oct and 14 to 30 Nov | Y | verified (page) |
| VD | red deer 1 to 5 and 7 to 11 Sep, chamois 14 to 18 and 21 to 24 Sep | Y | verified (directives) |
| LU | Rothirsch 1 Aug to 15 Dec etc.; rut pause 21 to 30 Sep 2026 | R + Y | verified (law + 2026 rules) |
| ZH | Rothirsch 2 Aug to 31 Dec; Reh 2 May / 1 Sep to 31 Dec | R | verified (JV decision text) |
| TG | federal seasons; Reh closed 1 Jan to 30 Apr, Rotwild closed 1 Jan to 31 Jul; Gämsen protected | R | verified (law), no 2026 schedule |
| AG | Rothirsch 1 Aug to 14 Sep and 16 Oct to 31 Dec; Gämse 1 Aug to 31 Dec | R | verified (law) |
| SO | Rothirsch 1 Aug to 30 Sep; Gämse 1 Aug to 31 Oct; Reh 1 May to 15 Dec | R | verified (law annex); annual plan not read |
| BL | federal closed seasons; yearly rules not read | R | **partly** (law only; bl.ch is behind a bot challenge) |
| JU | Permis général 3 Oct to 30 Nov; chamois 2 to 30 Sep | Y | verified (regulation 2026/27) |
| NE | roe 1 Oct to 9 Nov; chamois 12 to 24 Sep (7 days) | Y | verified (arrêté 2026/27) |
| SH | federal seasons plus Reh additions; only stalking and sitting hunt 1 Jan to 30 Sep | R | **partly** (law only) |
| ZG | Hochwild 1 to 23 Sep; Reh Oct 2026 and 7 and 14 Nov | Y | verified (rules + page) |

All dates below are copied from the sources. "NOT VERIFIED" items are at the end.

### GR (Graubünden): Y
- Law, Verordnung über den Jagdbetrieb (JBV, BR 740.025), version "in Kraft seit 01.08.2026 (Beschlussdatum: 30.06.2026)", https://www.gr-lex.gr.ch/app/de/texts_of_law/740.025 (API https://www.gr-lex.gr.ch/api/de/texts_of_law/740.025). **Art. 27 para. 1:** "Die Hochjagd 2026 wird in zwei Phasen durchgeführt. Sie dauert vom 3. bis und mit 13. September 2026 sowie vom 21. bis und mit 30. September 2026. Vom 14. bis und mit 20. September 2026 wird die Jagd unterbrochen." Para. 3: Gämsen "vom 3. bis und mit 13. September 2026 und vom 21. bis und mit 26. September 2026 jagdbar" (longer in some areas, to 30 Sep). **Art. 28 (Schusszeiten):** "vom 3. bis und mit 13. September 2026 von 06.00 Uhr bis 20.30 Uhr; ... vom 21. bis und mit 26. September 2026 von 06.30 Uhr bis 20.00 Uhr; ... vom 27. bis und mit 30. September 2026 von 06.30 Uhr bis 19.45 Uhr."
- Canton page "Termine, Patente, Formulare" https://www.gr.ch/DE/institutionen/verwaltung/diem/ajf/jagd/JagenInGraubuenden/Seiten/Termine,-Patente,-Formulare.aspx : "Niederjagd 2026: 01.10.2026 bis 30.11.2026"; "Passjagd 2026: 01.11.2026 bis 28.02.2027"; "Steinwildjagd 2026: 05.10.2026 bis 08.11.2026 (20 Tage pro Jäger:in)"; "Sonderjagd auf Hirsch und Reh 2026: Je nach Region, in der Zeit vom 31.10.2026 bis und mit 20.12.2026 (jeweils Mittwoch, Samstag und Sonntag, pro Gebiet max. zehn halbe Tage)." Also "Die Austragungstage finden innerhalb des angegebenen Zeitraums statt." And **Hochjagd 2027: 03.09.2027 bis und mit 12.09.2027 sowie 20.09.2027 bis und mit 30.09.2027**.
- Public-interest provisions in the same law: **Art. 52 (Signalfarbene Kleidung)** "Auf der Hochjagd ist das Tragen von Leuchtwesten, Leuchtjacken oder signalfarbener Kopfbedeckung bei Treib- und Drückjagden, auf Nachsuchen sowie in den gemäss Anhang 2 Litera a geöffneten Teilen der Wildschutzgebiete für alle Jägerinnen und Jäger obligatorisch." (a rule for hunters). **Art. 52a:** "In bestimmten Gebieten ist die Treib-, Drück- und Pirschjagd verboten, um Konflikte mit Siedlungen, Verkehrsanlagen sowie Naherholungsgebieten zu vermeiden." (list in Anhang 9).

### VS (Valais): Y
- Law, Arrêté sur l'exercice de la chasse en Valais 2026-2027 (RS 922.110), "du 17.06.2026 (état 01.07.2026)", https://lex.vs.ch/api/fr/texts_of_law/922.110 (app https://lex.vs.ch/app/fr/texts_of_law/922.110). **Art. 8 al. 1:** "L'ouverture de l'exercice de la chasse 2026-2027 est fixée au 21 septembre 2026."
- **Annexe 1, Art. A1-1** (table "Les dates de chasse sont les suivantes"): Permis A "Cerf, chamois, chevrette, sanglier, marmotte, renard, blaireau: 21.09.2026 - 03.10.2026, Lu - Sa"; Permis B "Brocard, sanglier, lièvre brun et variable, ...: 06.10.2026 - 24.10.2026, Ma + Sa"; B lièvre et lapin "27.10.2026 - 28.11.2026, Ma + Je + Sa"; B coq de tétras-lyre et lagopède "16.10.2026 - 31.10.2026"; C canards "03.11.2026 - 28.11.2026" and "01.12.2026 - 31.01.2027"; E renard etc. "16.11.2026 - 27.02.2027"; S sanglier, renard, blaireau on Saturdays "05.12.2026 ... 06.02.2027".
- Quirk in the text: Art. 8 al. 3 reads "L'ouverture de l'exercice de la chasse 2027-2028 est fixée au 20 septembre 2026"; the SCPF explanatory report (21.05.2026) says 20 September **2027**. Treat 2027 as the intended year.
- Annex 2 art. A2-1 (marmot protection): "dans un rayon de 500 mètres autour des cabanes du CAS et de ski-club", "200 mètres à gauche et à droite du sentier pédestre Gemmi - Adelboden" (hunters may not shoot marmots there).
- Canton page https://www.vs.ch/web/scpf/chasse-2026 and report https://www.vs.ch/documents/33024802/48447989/Rapport%20explicatif%20Arr%C3%AAt%C3%A9%20chasse%202026-2027/ce6028a1-2d8d-e6c9-99f6-67f6ceb3431a . The page also says: "Pour votre propre sécurité durant l'exercice de la chasse, il est recommandé de respecter les alertes officielles et les restrictions d'accès et la signalisation dans les zones exposées à des dangers naturels."

### BE (Bern): Y
- Official "Festlegungen für die Jagdperiode 2026/2027 (Jagdordnung)" (WEU, PDF created 2026-05-27) https://www.weu.be.ch/content/dam/weu/dokumente/lanat/de/jagd/Festlegungen-Jagperiode-DE.pdf . Rothirsch: "Hauptjagd: Vom 1. bis 6. September darf nur Kahlwild (C4-C5) und nur auf Ansitz erlegt werden. Ab dem 7. bis 20. September ..."; "Nachjagd: Vom 10. Oktober bis 15. November ..."; "Sonderjagd: Vom 23. November bis 5. Dezember." Gämse: "Ab 10. September können Sie sich jeweils ab 15:00 Uhr ... informieren"; zone clauses say "Die Jagd auf die Gämse ist in den Zonen 2, 3 und 4 vom 10. bis 30. September gestattet." Gämse in October only in Wildraum 5 on Thursdays and Saturdays (Napf).
- Canton page (updated 2026-10-02) https://www.weu.be.ch/de/start/themen/jagd-fischerei/jagd-wildtiere/jagen-kanton-bern/jagdzeiten.html : "Die nächste Phase ist die Nachjagd vom 10. Oktober bis 15. November 2026."; "Keine Jagdtage sind: Sonntage; Weihnachten (25. und 26. Dezember); Jahreswechsel (1. und 2. Januar); vorgeschriebene Schontage"; "Im Oktober und November darf tagsüber am Dienstag, Donnerstag und Freitag nicht gejagt werden. Ausnahme ist die Donnerstagsjagd in Gebieten mit untragbaren Wildschäden." Night hunting from 16 Nov to end Feb around full moon.
- Roe deer (Patent B) 1 Oct to 15 Nov and Murmeltier 10 to 30 Sep are only in the table "Jagdzeiten im Kanton Bern" https://www.weu.be.ch/content/dam/weu/dokumente/lanat/de/jagd/Jagdzeiten-detailliert-de.pdf , which is the **2025** edition (PDF created 2025-08-05; shows "bis 06.12.2025"). No 2026 edition found; treat roe and marmot dates as 2025 values.

### TI (Ticino): Y
- Canton page https://www4.ti.ch/dt/da/ucp/temi/caccia/caccia/caccia-alta/ : "Caccia alta 2026: dal 05.09 al 19.09 e dal 23.09 al 27.09.2026" (also "Caccia alta 2025: dal 06.09 al 20.09 e dal 24.09 al 28.09.2025" and "Caccia alta 2027: dal 04.09 al 18.09 e dal 22.09 al 26.09.2027"). "Il periodo di caccia viene definito dal regolamento venatorio, aggiornato ogni anno nel mese di agosto."
- Caccia bassa https://www4.ti.ch/dt/da/ucp/temi/caccia/caccia/caccia-bassa (no year on page): "dal 16 ottobre al 30 novembre nei giorni di martedì, mercoledì, giovedì, sabato e domenica." Hours: "Dal 16 ottobre al 30 ottobre dalle ore 08.00 alle ore 18.30. Dal 31 ottobre al 30 novembre dalle ore 07.30 alle ore 16.30."

### SG (St. Gallen): R
- Law sGS 853.111 Verordnung über die Jagdvorschriften (Stand 01.06.2024), https://www.gesetzessammlung.sg.ch/app/de/texts_of_law/853.111 (API https://www.gesetzessammlung.sg.ch/api/de/texts_of_law/853.111). **Art. 2 para. 1:** "Rotwild: dritter Samstag im August bis dritter Samstag im Dezember"; "Rehbock, Schmalreh, nicht tragende und nicht führende Rehgeiss: 1. Mai bis dritter Samstag im Dezember"; "führende Rehgeiss und Rehkitz: dritter Samstag im August bis dritter Samstag im Dezember"; "Gämsbock: dritter Samstag im August bis 31. Oktober"; "Gämsgeiss, Gämsjährling und Gämskitz: dritter Samstag im August bis dritter Samstag im Dezember." **Art. 8 para. 2:** "Die Bewegungsjagd ist vom 1. Oktober bis zum dritten Samstag im Dezember gestattet." Art. 2 para. 4: the Amt "kann für einzelne Tierarten Schonphasen während der Jagdzeit oder Jagdzeitverlängerungen anordnen."
- My calendar arithmetic for 2026 (not in the source): third Saturday of August = 15 Aug 2026; third Saturday of December = 19 Dec 2026.

### UR (Uri): Y
- Canton page "Jagd 2026" https://www.ur.ch/dienstleistungen/3048 : "Jagdzeiten 2026 ... Hochwildjagd: 1. Block: 7. September bis 19. September 2026 (Gäms-, Murmeltier- und Rothirschjagd); 2. Block: 28. September bis 30. September 2026 (Rothirschjagd); Niederwildjagd: 12. Oktober bis 30. November 2026". Rule of thumb on the page: "Die Hochwildjagd beginnt im Kanton Uri in der Regel am ersten Montag im September, die Niederwildjagd in der Regel am zweiten Montag im Oktober." Press release 12 Feb 2026 https://www.ur.ch/mmdirektionen/133025 confirms the 2026 pattern and gives 2027 (6 to 18 Sep, 27 to 29 Sep).

### GL (Glarus): Y
- Regierungsrat, "Vorschriften für die Ausübung der Jagd im Jahre 2026" ("Glarus, im Juli 2026") https://www.gl.ch/public/upload/assets/66368/Jagdvorschriften%20_26%20mit%20Anh%C3%A4ngen.pdf (page https://www.gl.ch/verwaltung/bau-und-umwelt/umwelt-wald-und-energie/jagd-und-fischerei/jagd/jagd-20222023.html/803 ; default curl user agent gets 403, a descriptive user agent works). **1.1.1 Dauer:** "7. – 21. September (Die Jagd am Eid. Bettag, dem 20. September, ist verboten)". Rehwild "Jagdzeiten 1. – 21. Oktober, ausgenommen Schontage (Montag, Freitag)"; Feldhase "16. Oktober – 10. November"; Schneehase "1. Oktober – 30. November"; Birkhahn "16. Oktober – 30. November"; Schwarzwild "1. Oktober – 30. November". 2.1.2 Schontage: "Alle Montage und Freitage, ausgenommen bei der Nacht- und Passjagd und der Nachjagd."
- Same document, 9.11 Herdenschutz (relevant for camping near alps): "Auf verschiedenen Alpen und Weiden sind während der Hoch- und Niederwildjagd Herdenschutzhunde im Einsatz, welche ihre Nutztierherden auch gegen Jagdhunde verteidigen. Wo die Hunde im Einsatz sind und das richtige Verhalten gegenüber ihnen ist unter www.herdenschutzschweiz.ch abrufbar."

### SZ (Schwyz): Y
- Umweltdepartement, "Jährliche Jagdbetriebsvorschriften" (Schwyz, 28. Mai 2026; PDF created 2026-05-27) https://www.sz.ch/public/upload/assets/61126/Jaehrliche_Jagdbetriebsvorschriften.pdf . "Das Jagdjahr im Kanton Schwyz dauert vom 1. September 2026 bis zum 27. Februar 2027." Rotwild: "Die Rotwildjagd beginnt am 1. September und dauert bis am 19. September 2026." and a second window: "Am Samstag, 07. November, 12. bis 14. November und 19. bis 21 November 2026 sind nur Spiesser bis Lauscherhöhe und die Kategorien C4 bis C7 jagdbar". Gämse: "Die Gämsjagd beginnt am 1. September und dauert bis am 19. September 2026." Murmeltier "Vom 1. bis 19. September 2026". Haarraubwild "1. September ... bis am 28. November 2026"; Wasserwild "16.11. – 12.12.2026 und 11.01. – 16.01.2027".
- Federal reserve inside the canton: "Im Eidgenössischen Jagdbanngebiet Silberen–Jägern–Bödmerenwald wird das Gebiet mit partiellem Schutz für die Rotwildjagd am 4., 7. und 8. September 2026 zwischen 06:00 – 14:00 Uhr für die Schussabgabe freigegeben."

### OW (Obwalden): Y
- Canton page https://www.ow.ch/dienstleistungen/2133 (2025 and 2026 tables). "Jagdzeiten 2026: Hochjagd Di, 1. September 2026 bis Do, 24. September 2026; Rehjagd Mo, 5. Oktober 2026 bis Sa, 24. Oktober 2026; Niederjagd Mo, 5. Oktober 2026 bis Mo, 30. November 2026; Wasserwildjagd Mo, 5. Oktober 2026 bis Sa, 27. Februar 2027; Winterjagd Di, 1. Dezember 2026 bis Sa, 27. Februar 2027."

### NW (Nidwalden): Y
- Staatskanzlei press release 27 Mai 2026 https://www.nw.ch/_docn/449392/Medienmitteilung_Jagdbetriebsvorschriften_2026.pdf : "Die Hochjagd dauert vom 1. bis 22. September 2026. Die Niederjagd findet vom 15. Oktober bis 30. November statt (ausgenommen Reh: bis 4. November)." and "Neu wird bei Bewegungsjagden das Tragen von Signalkleidung vorgeschrieben." (a rule for hunters). The Jagdbetriebsvorschriften 2026 text itself was not read.

### AI (Appenzell Innerrhoden): Y
- Law, Standeskommissionsbeschluss über die Jagd (StKB Jagd, GS 922.102) Anhang 2 "Jagd- und Schusszeiten (Stand 1. Juli 2026)", https://ai.clex.ch/api/de/versions/2447/annexes (app https://ai.clex.ch/app/de/texts_of_law/922.102/versions/2447): "Die ordentliche Hochwildjagd findet vom 7. September 2026 bis zum 3. Oktober 2026 statt." Schusszeiten: 7 to 12 Sep 05:50 to 20:30; 14 to 19 Sep 06:00 to 20:20; 21 to 26 Sep 06:10 to 20:00; 28 Sep to 3 Oct 06:20 to 19:50. "Die ordentliche Niederwildjagd findet vom 5. Oktober 2026 bis zum 14. November 2026 statt." (Schusszeiten 06:30 to 19:30 down to 06:30 to 17:15 in winter time); "Die ordentliche Bau- und Vogeljagd findet vom 5. Oktober 2026 bis zum 19. Dezember 2026 statt."; "Die Passjagd findet vom 16. November 2026 bis zum 27. Februar 2027 statt."
- Canton page https://www.ai.ch/themen/natur-und-umwelt/jagd : "Die Jagd 2026 startet mit der Hochwildjagd am Montag, 07. September 2026 und die Niederwildjagd am Montag, 05. Oktober 2026, sofern die Genehmigung durch die StK vorliegt."

### AR (Appenzell Ausserrhoden): Y
- Canton page https://ar.ch/verwaltung/departement-bau-und-volkswirtschaft/amt-fuer-raum-und-wald/abteilung-natur-und-wildtiere/jagd/jagdvorschriften/ : "Die Ausserrhoder Hochjagd auf Rothirsche und Gämsen dauert vom 1.- 19. September 2026. Die zweite Jagdperiode auf Rotwild ist vom 9. November - 5. Dezember 2026 vorgesehen. Die Niederjagd auf Rehe beginnt am 7. September und endet am 7. November 2026. Für den Dachs, den Fuchs und das Wildschwein ist die Jagdzeit vom 1. Juli 2026 bis max. 28. Februar 2027 festgelegt." The PDF "Jagdvorschriften 2026/2027" was linked but not read.

### FR (Fribourg): Y
- Canton page https://www.fr.ch/sport-et-loisirs/sport-de-loisirs/informations-et-periodes-de-chasse (the heading says "Saison de chasse 2025-2026" but the text is 2026): "La chasse dans le canton de Fribourg est ouverte du 1 er septembre 2026 à la fin février 2027 (hors chasses complémentaires)."; "La chasse du chamois est autorisée du 21 septembre au 3 octobre 2026 ainsi que durant deux samedis supplémentaires (19 septembre et 10 octobre 2026)."; "La chasse spéciale du chamois a lieu du 21 au 26 septembre 2026."; "La chasse au chevreuil a lieu du 21 septembre (lundi du Jeûne fédéral) au 17 octobre 2026."; "La chasse du cerf est autorisée du 19 au 31 octobre 2026 et du 14 au 30 novembre 2026 dans les UdG 1, 2 et 3."
- Same page, **hours and days:** "il est permis de tirer les animaux aux heures suivantes : depuis une heure avant le lever du soleil selon les éphémérides de Berne. jusqu'à une heure après le coucher du soleil selon les éphémérides de Berne. La chasse est interdite: le dimanche; les mercredis et vendredis des mois de septembre et d'octobre (pour la chasse en plaine); les vendredis des mois de novembre, décembre, janvier et février (pour la chasse en plaine et en montagne); ..." plus public holidays.

### VD (Vaud): Y
- Directives du 3 juillet 2026 sur la chasse en 2026-2027 (DJES; PDF created 2026-07-07) https://www.vd.ch/fileadmin/user_upload/themes/environnement/biodiversite/fichiers_pdf/chasse/Actualit%C3%A9/Directives_chasse_2026_2027.pdf . **Annexe I:** "Cerf, chasse en équipe (Alpes + Plaine): 1-5 et 7-11.09.2026; 2-7, 9-14, 16-21, 23-28 et 30.11.2026; 1-5, 7-12.12.2026"; "Chamois Alpes (y compris Chablais): 14-18.09 et 21-24.09.2026"; "Chamois Jura (y compris Pied du Jura) + Chamois Plaine: 17 et 18.09.2026 / 17 et 18.12.2026"; "Chevreuil, Sanglier ...: 1.10 - 30.10.2026, Lu-ma-je-ve"; "Chevreuil à l'affût et à l'approche (aube et crépuscule): 1.10 - 31.10.2026, Lu-ma-je-ve-sa"; "Cerf, chasse individuelle: 1.10 - 11.12.2026, lu-ma-je-ve"; also "lundi du Jeûne (21 septembre 2026) et le 2 janvier 2027".
- **Art. 5 al. 2:** "La chasse est autorisée le lundi, le mardi, le jeudi et le vendredi." **Art. 6 al. 1:** "Les heures pendant lesquelles la chasse est autorisée sont les suivantes : une heure avant le lever du soleil, selon les éphémérides de la ville de Berne; une heure après le coucher du soleil, selon les éphémérides de la ville de Berne." (Exceptions for boar and roe at dawn and dusk.)

### LU (Luzern): R plus Y
- Law, Kantonale Jagdverordnung (KJSV, SRL 725a; version in force since 2018-04-01) **§ 15 Jagdzeiten**, https://srl.lu.ch/api/de/texts_of_law/725a : "Rothirsch: vom 1. August bis 15. Dezember."; "Gämse: vom 1. September bis 15. Dezember."; "Rehkitz: vom 1. Oktober bis 15. Dezember."; "Feldhase: vom 1. November bis 15. Dezember."; Rehbock and Schmalreh "Vom 1. Mai bis 30. September darf nur mit der Kugel auf Ansitz oder Pirsch gejagt werden. Vom 1. Oktober bis 15. Dezember darf mit der Kugel und mit Schrot gejagt werden." (Rehgeiss: same, but the bullet-only phase is 1 to 30 September); "Im Übrigen gelten die bundesrechtlich festgelegten Schon- und Jagdzeiten." Drive hunts "vom 1. Oktober bis 15. Dezember".
- Year-specific: Jagdbetriebsvorschriften 2026 (Sursee, 20.06.2026, in force 1.8.2026) https://lawa.lu.ch/-/media/LAWA/Dokumente/njf/jagd/Jagdreviere/Vorschriften/jagdbetriebsvorschriften.pdf : "1.4.1 Während der Brunftruhe vom 21. bis 30. September 2026 ist die Rotwildjagd untersagt."; feldhase moratorium in 2026/27.
- Jagdkalender 2026/27 (lawa Merkblatt, © March 2026; graphic) https://lawa.lu.ch/-/media/LAWA/Dokumente/njf/jagd/Jagdreviere/mb/jagdkalender_kanton_luzern.pdf : "An Sonntagen und öffentlichen Ruhetagen ist die Ausübung der Jagd im ganzen Kanton ... verboten (KJSG § 25 Abs. 1)." "Nachts darf nicht gejagt werden. Als Nachtzeit gilt die Zeit von einer Stunde nach kalendarischem Sonnenuntergang bis einer Stunde vor kalendarischem Sonnenaufgang (JSV Art. 3ter und KJSG § 25 Abs. 2)."

### ZH (Zürich): R
- The text I read is the Regierungsrat decision of 5 Oct 2022 establishing the Kantonale Jagdverordnung (JV): https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/umwelt-tiere/tiere/fischerei-und-jagd/jagd/kantonale_jagdverordnung.pdf . **§ 27 Abs. 1:** "Rehböcke, Schmalrehe und Galtgeissen: 2. Mai – 31. Dezember"; "Rehgeissen und Rehkitze: 1. September – 31. Dezember"; "Wildschweine: 1. Juli – Ende Februar"; "Rothirsch: 2. August – 31. Dezember gemäss Weisung des ALN"; "Gämse: 2. August – 31. Dezember gemäss Weisung des ALN". **§ 28:** "Die Schussabgabe ist von einer Stunde vor dem kalendarischen Sonnenaufgang bis einer Stunde nach dem kalendarischen Sonnenuntergang gestattet."; "An Sonntagen ist nur die Einzeljagd gestattet ..."; "An öffentlichen Ruhetagen und hohen Feiertagen ... ist die Jagd untersagt."
- Jagdbetriebsvorschriften 2025-2033 (ALN, 12 March 2025) https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/umwelt-tiere/tiere/fischerei-und-jagd/jagd/jagdbetriebsvorschriften_2025-2033.pdf : "Zwischen dem 2. August und dem 30. September kann alles Rotwild ... erlegt werden. Zwischen dem 1. Oktober und dem 31. Dezember soll das Ziel-GV erreicht werden." Not year-specific (valid for the 2025-2033 lease period). Later amendments to the JV were not checked.

### TG (Thurgau): R (no 2026 schedule)
- RB 922.11 Verordnung des Regierungsrates (in force since 2018-04-01) **§ 14**, https://www.rechtsbuch.tg.ch/app/de/texts_of_law/922.11 : "In Ergänzung zu den bundesrechtlich geschützten Wildtieren sind folgende Arten geschützt: ... 2. Gämsen; 3. Feldhasen; ... 5. Waldschnepfen"; "Abweichend von den bundesrechtlich festgelegten Schonzeiten gelten für die nachfolgenden Wildtiere folgende Schonzeiten: 1. Rehwild: 1. Januar – 30. April; 2. Rotwild: 1. Januar – 31. Juli." "Die Ausübung der lauten Jagd ist in der Zeit vom 1. Oktober bis 31. Dezember mit ... Stöberhunden ... gestattet."
- The Jagd- und Fischereiverwaltung page https://jfv.tg.ch/jagd.html/8654 has no 2026 hunting dates. Rule-based only.

### AG (Aargau): R
- AJSV (SAR 933.211, version in force since 30.08.2025) **§ 14 Jagdzeiten**, https://gesetzessammlungen.ag.ch/app/de/texts_of_law/933.211 : "Rehbock, Schmalreh und Galtgeiss vom 1. Mai bis 31. Dezember"; "Rehgeiss und Rehkitz vom 1. September bis 31. Dezember"; "Für den Rothirsch gelten die folgenden Jagdzeiten: 1. August bis 14. September und 16. Oktober bis 31. Dezember."; "Für die Gämse gelten die folgenden Jagdzeiten: 1. August bis 31. Dezember."; "Im Übrigen gelten die bundesrechtlich festgelegten Jagd- und Schonzeiten." Bewegungsjagden "vom 1. Oktober bis 31. Dezember".

### SO (Solothurn): R
- Jagdverordnung (BGS 626.12, version in force since 2018-01-01) **Anhang 1 "Jagdbare Wildtierarten und Jagdzeiten (§ 15)"**, https://bgs.so.ch/app/de/texts_of_law/626.12 (annex https://bgs.so.ch/api/de/versions/4687/annexes): "Reh 1. Mai bis 15. Dezember"; "Rothirsch 1. August bis 30. September"; "Gämse 1. August bis 31. Oktober"; "Feldhase 1. Oktober bis 31. Dezember"; "Wildschwein 1. Juli bis Ende Februar". § 15 lets the department change the Rothirsch/Gämse times in the cross-revier plan. The annual plan "Jagdplanung Rotwild 2026" sits on so.ch, which this sandbox cannot reach ("Host not in allowlist").

### BL (Basel-Landschaft): R, partly read
- WJV (SGS 520.11, version in force since 2022-01-01) **§ 6**, https://bl.clex.ch/app/de/texts_of_law/520.11 : "Für alle Wildtierarten gelten die Schonzeiten der Bundesgesetzgebung." and "Die Fachstelle veröffentlicht jährlich zu Beginn des Jagdjahres Bestimmungen zur Ausübung der Jagd." **§ 21:** "Die laute Jagd darf vom 1. Oktober bis 31. Dezember ausgeübt werden." § 20: "An den hohen Feiertagen ist die Jagd verboten."
- The yearly provisions are on bl.ch, which answers with a Cloudflare challenge page; I did not work around it.

### JU (Jura): Y
- Règlement sur l'exercice de la chasse en 2026 et 2027 (Gouvernement, 21 avril 2026) https://www.jura.ch/Htdocs/Files/v/3afc751315d25a327903df8faf15a1b5cd8ed6e0266772be40522b3dfdc52034.pdf/260421-reglementChasse26-27.pdf?download=1 . **Art. 12 al. 2:** "Permis général: 3 octobre au 30 novembre" (2027: 2 octobre au 29 novembre); "Permis D chamois: 2 septembre au 30 septembre"; "Permis A, plume: 2 août au 30 septembre / 1er décembre au 15 février 2027". **Art. 13:** "La chasse est autorisée les lundis, mercredis et samedis durant les mois de juin, juillet, août, septembre, octobre et novembre." "La chasse est interdite le dimanche et les jours fériés officiels ..." **Art. 14:** chevreuil "depuis le lever du soleil jusqu'au coucher du soleil" (affût hors forêt dès une heure avant le lever).

### NE (Neuchâtel): Y
- Arrêté concernant l'exercice de la chasse pendant la saison 2026-2027 (Feuille officielle, 4 mai 2026) https://www.ne.ch/sites/default/files/2026-05/FO19_04_2026_05_04_DDTE_103_ACE_Chasse_2026-2027.pdf . **Art. 3:** Chevreuil "du jeudi 1er octobre au lundi 9 novembre 2026"; Chamois "les samedi 12, lundi 14, mercredi 16, jeudi 17, samedi 19, mercredi 23 et jeudi 24 septembre 2026"; Sanglier "Chasse dite « générale » : du lundi 3 août 2026 au samedi 30 janvier 2027"; Lièvre "les samedis 24 et 31 octobre 2026". **Art. 4 al. 2-3:** "la chasse n'est autorisée que le lundi, le mercredi, le jeudi et le samedi"; "La chasse est interdite le dimanche et les jours suivants ...". **Art. 5:** "Autre chasse: Depuis une heure avant le lever du soleil jusqu'à une heure après le coucher du soleil."

### SH (Schaffhausen): R, partly read
- Verordnung SHR 922.101 (in force since 2023-04-01) **§ 13**, https://rechtsbuch.sh.ch/app/de/texts_of_law/922.101 : "Die jagdbaren Arten und Schonzeiten richten sich nach Bundesrecht (Art. 5 JSG und Art. 3 bis JSV)." plus "Weibliches Rehwild und Kitze beiderlei Geschlechts zusätzlich vom 1. Mai bis 31. August, ausgenommen Galtgeiss und Schmalreh"; **§ 16:** "Zwischen 1. Januar und 30. September sind nur die Pirsch- und Ansitzjagd gestattet." No 2026 schedule found on sh.ch.

### ZG (Zug): Y
- BGS 932.111 Jagdbetriebsvorschriften 2026/2027 ("Stand 3. Juli 2026"), https://bgs.zg.ch/app/de/texts_of_law/932.111 : "Das Jagdjahr dauert vom 1. April 2026 bis zum 31. März 2027."; "Die Jagdausübung auf Rot-, Gams- und Schwarzwild ist während der Jagdzeit jeweils am Montag, Dienstag, Mittwoch und Samstag erlaubt. Die Jagdzeit dauert vom 1. September 2026 bis und mit 23. September 2026."; Niederwild "jeweils am Montag, Mittwoch und Samstag ... Rehwild im Oktober 2026 sowie am 7. und 14. November 2026"; Sonderjagd Rotwild possible "2. bis und mit 4. November 2026".
- Canton page https://zg.ch/de/natur-umwelt-tiere/arten-und-lebensraeume/jagen/info_laufende_jagd : "Die Niederwildjagd auf Rehwild dauert vom 1. Oktober 2026 bis zum 31. Oktober 2026 sowie am 7. und 14. November 2026. Die Jagdausübung ist jeweils am Montag, Mittwoch und Samstag."

## 3. What official sources say that matters to campers

Only what an official text states (nothing from memory):
- **Hunting hours and days (for hunters)** are published as: GR "Schusszeiten" (06:00 to 20:30 early September, narrowing to 19:45 by 27 to 30 Sep); AI (05:50 to 20:30, narrowing weekly); FR, VD, NE, ZH "eine Stunde vor ... Sonnenaufgang bis ... eine Stunde nach ... Sonnenuntergang"; JU roe "depuis le lever du soleil jusqu'au coucher du soleil"; TI caccia bassa 07:30/08:00 to 16:30/18:30; LU night = "eine Stunde nach kalendarischem Sonnenuntergang bis einer Stunde vor kalendarischem Sonnenaufgang". Federal: JSV Art. 3ter, no night hunting in forest.
- **Rest days:** no hunting on Sundays in BE ("Keine Jagdtage sind: Sonntage"), FR ("La chasse est interdite: le dimanche"), NE, JU, LU ("An Sonntagen und öffentlichen Ruhetagen ist die Ausübung der Jagd im ganzen Kanton ... verboten"); ZH allows only Einzeljagd on Sundays (§ 28 para. 3). BL and SH have a "Verbot der Sonntags- und Nachtjagd" (BL WJV § 20 is titled "Ausnahmen vom Verbot der Sonntags- und Nachtjagd", SH § 15 "Verbot der Sonntags- und Nachtjagd"); I did not read the BL/SH law that sets the ban itself. VD allows hunting only Mon, Tue, Thu, Fri (plus special days). GL: no hunting Mondays and Fridays. GR Sonderjagd: Wednesday, Saturday, Sunday. These differ by canton and by hunt, so the app should not claim "never on Sunday".
- **Hunters' own safety rules:** GR Art. 52 (signal vests/hats compulsory for hunters in driven hunts, follow-up searches and opened parts of wildlife reserves) and NW press release (signal clothing now compulsory in driven hunts). These bind hunters; **no official text I found tells hikers or campers to wear bright clothing**.
- **Public-interest provisions:** GR Art. 52a bans driven and stalking hunts in listed areas "um Konflikte mit Siedlungen, Verkehrsanlagen sowie Naherholungsgebieten zu vermeiden". VS page: follow "alertes officielles et les restrictions d'accès" (aimed at hunters, mentions natural hazards).
- **Herd-protection dogs and hunting:** GL (quoted above) says guard dogs are on alps during the hunt and refers to herdenschutzschweiz.ch.
- **Hunting inside federal reserves does occur** in the "Gebiet mit partiellem Schutz" under cantonal regulation plans (VEJ Art. 9): SZ Silberen-Jägern-Bödmerenwald open for red deer on 4, 7 and 8 Sep 2026, 06:00 to 14:00; BE Jagdordnung: "Im Jagdjahr 2026/27 findet im eidgenössischen Jagdbanngebiet Schwarzhorn eine Regulation des Rotwildbestands unter Einbezug der Jägerschaft statt (Freigabe: 80 Tiere)"; GL wolf rules: "Abschüsse in den eidgenössischen Jagdbanngebieten sind verboten." The VEJ rule "Das Tragen, Aufbewahren und die Verwendung von Waffen und Fallen ist verboten" (Art. 5 para. 1 let. d) has exceptions for these cases (cantons may allow exceptions in partial-protection areas).

## 4. Suggested neutral wording for the app (my proposal)

"Hunting seasons run mainly from September to December and differ by canton (federal law only sets closed seasons, JSG Art. 5). Hunters may shoot from about one hour before sunrise to one hour after sunset in several cantons, and on days that differ from canton to canton. Check your canton's hunting dates before you go." Do not state hunting dates as fixed national dates; if canton-specific dates are shown, show them as "2026" with the source and date read.

## 5. NOT VERIFIED

- **Any official Swiss guidance to hikers or campers** (bright clothing, staying on paths, avoiding dawn and dusk) during hunting season. I searched the cantonal pages I read and ran web searches; the only matches were rules for hunters and French/German non-official advice. Not usable.
- **Whether dates shown by cantons in autumn have been changed since I read them**: pages may be updated (BE page shows data "Aktualisiert am 02.10.2026"), and AI says the start of 2026 hunting depends on "die Genehmigung durch die StK" (the annex I read says the hunt runs 7 Sep to 3 Oct 2026, so the approval seems given).
- **BL yearly hunting provisions and any 2026 dates** (bl.ch is behind a bot challenge); **SH and TG 2026 schedules**; **SO annual Jagdplanung 2026** (so.ch not in the sandbox allowlist, `www.be.ch` too); **GL, UR, SZ, OW, NW, AR, VD "Sonderjagd" details beyond what is quoted**.
- **BE roe deer (1 Oct to 15 Nov) and marmot (10 to 30 Sep)**: only from the 2025 table.
- **ZH**: the text read is the 2022 decision, not the consolidated current law; amendments not checked. SG's third-Saturday dates and the derived "huntable windows" in section 1 are my arithmetic.
- **NW Jagdbetriebsvorschriften 2026 and AR Jagdvorschriften 2026/2027 PDFs**: only the canton's own summary was read.
- **Whether a Sunday or weekday ban also applies in cantons whose text I did not search for it** (GR, VS, UR, SZ, OW, NW, AI, AR, TG, AG, SO, SH, ZG, SG): not checked.
- **Ibex (Steinwild, bouquetin) and other regulation hunts** have their own dates (for example GR "05.10.2026 bis 08.11.2026", SZ "Vom 1. September bis 31. Oktober 2026", VD "24, 25, 26.08.2026"); I did not collect them for the other cantons.

