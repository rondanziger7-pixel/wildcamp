<!-- Research memo, read 2026-10-06. It backs the fire wording in src/restrictions.ts: one text per measure type of the federal map, no claim that a stove is
     allowed under a ban (no source says so except for gas and electric grills in Graubünden, Vaud and Valais), and no "cantons often ban at this level". -->

# r1_fire: forest-fire rules, fire bans and stoves (task f)

Researcher: subagent for Wildcamp CH. Repo untouched. All pages read on **2026-10-06 (UTC)** unless another date is given.
Rule applied: only statements I read in an official source are marked VERIFIED. Web-search summaries were used to find documents only.
Read tools: `curl` (descriptive user agent), `pdftotext`, PDF page images rendered with `pdftoppm` (needed where the answer is an icon, not text), geo.admin.ch identify/find API.

## 0. Bottom line for the app

1. VERIFIED: Fire bans are **cantonal** (in some cantons also communal). BAFU: "Die Kantone sind zuständig für das Ergreifen von Massnahmen. Die kantonalen Vorschriften sind massgebend." The federal map is information, not the rule.
2. VERIFIED: A danger level does **not** automatically create a ban (BAFU FAQ). The app sentence "cantons often ban them at this level" is therefore not backed by BAFU. What is backed: Bern's concept says a ban "can be proportionate" from level 3; Valais states fire is prohibited in forest and within 100 m from level 4.
3. STOVES: only **Bern** names camping stoves in an official table ("Campingkocher und -grill": prohibited inside forest + 50 m under a ban, allowed with "Erhöhte Vorsicht" outside). **Graubünden** names petrol cookers (banned) and says gas and electric *grills* are allowed on firm ground under constant supervision. **Ticino, Vaud and Valais** texts do not mention camping stoves at all. So "a stove is allowed under a ban" cannot be said for any canton except by analogy to gas grills.
4. The app's sentence "a stove on bare ground is a lower risk" (src/restrictions.ts line 132) has **no primary source** I could find. The nearest official statement is Graubünden's reason for allowing gas/electric grills ("weil kein Funkenflug möglich ist ...") and Bern lists camping stoves as banned in the ban zone. Recommend deleting it.
5. The app's "Do not light fires or use a stove outdoors where the ban applies" is the safe default (it matches Bern) but is stricter than what Graubünden, Vaud and Valais allow for gas/electric grills, and the text does not tell users the **scope** (forest + distance vs. everything in the open). Neutral wording is in section 6.
6. The BAFU layer separates five measure types; the app collapses two of them ("Conditional ban", "Absolute ban in the forest and near forest") into one "Fire ban" text. Details in section 2 and 5.

## 1. waldbrandgefahr.ch (BAFU, federal portal)

Base URL pattern: `https://www.waldbrandgefahr.ch/de/<page>`. Operator: Bundesamt für Umwelt BAFU (page footer). All VERIFIED.

**Bedeutung der Massnahmen** (`/de/bedeutung-der-massnahmen`), the official meaning of the five measure types:

| Measure (Massnahme) | Meaning (Bedeutung), verbatim |
|---|---|
| Keine Massnahmen in Kraft | "Feuer möglich, jeweils mit der angebrachten Vorsicht" |
| Mahnung zu sorgfältigem Umgang mit Feuer im Wald und in Waldesnähe/im Freien | "Feuern im Wald und in Waldesnähe/im Freien möglichst unterlassen" |
| Bedingtes Feuerverbot im Wald und in Waldesnähe/im Freien | "Feuer nur auf festeingerichteten Feuerstellen toleriert, jeweils mit der angebrachten Vorsicht" |
| Absolutes Feuerverbot im Wald und in Waldesnähe | "Feuer anderswo im Freien möglich, jeweils mit der angebrachten Vorsicht" |
| Absolutes Feuerverbot im Freien | "Generell kein Feuer im Freien erlaubt" |

The page text lists measure and meaning in sequence; the pairing above is confirmed by the layer attributes (`title_de` / `description_de`, section 2).
- "Die Kantone sind zuständig für das Ergreifen von Massnahmen. Die kantonalen Vorschriften sind massgebend."
- "Für Fragen zu einzelnen Massnahmen wenden Sie sich bitte direkt an die Kantone."

**FAQs** (`/de/fragen`):
- "Für Massnahmen und Vorschriften wie Feuerverbote sind die Kantone zuständig." / "Massnahmen und Vorschriften kann der Kanton verordnen, in gewissen Kantonen aber auch die Gemeinden."
- "Ist es möglich, bei einem «absoluten Feuerverbot im Freien» noch zu grillieren? Dies ist kantonal geregelt. Die Bestimmungen können je nach Kanton variieren."
- "Wie gross muss der Abstand zum Wald sein, wenn ein «Absolutes Feuerverbot im Wald und in Waldesnähe» gilt? Dies ist kantonal geregelt."
- "Weder das BAFU noch das fedpol kann selbstständig ein nationales Feuer- oder Feuerwerksverbot erlassen. ... Einschränkungen oder Verbote werden von den zuständigen kantonalen und teilweise kommunalen Behörden aufgrund der konkreten Situation vor Ort erlassen. Eine bestimmte Gefahrenstufe führt nicht automatisch zu einem Verbot."
- "90% der Waldbrände in der Schweiz werden von uns Menschen verursacht, meistens durch Unachtsamkeit oder Fahrlässigkeit. Das heisst z.B. durch das Wegwerfen von Zigarettenstummeln, das Abstellen von heissen Fahrzeugmotoren auf den Waldboden oder nicht vollständig gelöschte Grillfeuer."
- "Die Kantone entscheiden, ob die Einschätzung [des BAFU] übernommen oder ob die Warnstufe geändert wird." (danger level is a BAFU estimate that cantons can change)

**Verhaltensempfehlungen** (`/de/verhaltensempfehlungen`):
- "Das Entfachen von Feuern im Wald und ausserhalb des Waldes hat immer - auch bei geringer und mässiger Waldbrandgefahr - mit der nötigen Vorsicht zu erfolgen."
- "Feuerverbote unbedingt einhalten!" / "Beim Grillieren festeingerichtete Feuerstellen verwenden." / "Feuer laufend überwachen und allfälligen Funkenwurf sofort löschen." / "Grill-/Feuerstellen und deren Umgebung nur im absolut gelöschten Zustand verlassen." / "Bei starken und böigen Winden auf Feuer im Freien unbedingt verzichten." / "Brennende Zigaretten und Zündhölzer nie wegwerfen."
- "Waldbrände sofort über die Telefonnummer 118 der Feuerwehr melden."

**Gefahrenstufen** (`/de/gefahrenstufen`), only describes the fire, not what is allowed. Level 3 "erhebliche Gefahr": "Brennende Streichhölzer und Funkenflug eines Grillfeuers können einen Brand entfachen." Level 4 "grosse Gefahr": "Brennende Streichhölzer, Funkenflug eines Grillfeuers und Blitzschläge entfachen sehr wahrscheinlich ein Feuer."

**Kantonale Fachstellen** (`/de/kantonale-fachstellen`): official directory with contact data and one web link per canton (AG ... ZH, FL). Useful as the app's "where to check" link: https://www.waldbrandgefahr.ch/de/kantonale-fachstellen

## 2. The federal layer the app reads: `ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone`

Read 2026-10-06 22:44 UTC via api3.geo.admin.ch (identify + find), legend and STAC.
- VERIFIED (BAFU metadata, geocat/STAC/legend): "Contains the forest fire prevention measures currently in force in the cantons." Legend "Data status 06.10.2026 12:01". Point of contact BAFU Abteilung Wald.
- VERIFIED attributes per feature: `name_*`, `title_de/fr/it/en`, `description_de/fr/it/en`, `valid_from` (dd.mm.yyyy), `canton`, `label`.
- VERIFIED: the four-language titles are exactly BAFU's measure types. English strings the app receives (lang=en):

| title_en | description_en | cantons showing it on 2026-10-06 |
|---|---|---|
| No measures in force | Fire possible, due caution to be exercised in all cases | GR (part), SH, TI |
| Warning that care should be taken when lighting fires in the forest and in the proximity of the forest/in the open | The lighting of fires should be avoided in the forest and in the proximity of the forest | AG, BE, FR, JU, NE, SG (part), SO, SZ, TG, VS (part), ZH |
| Conditional ban on fires in the forest and in the proximity of the forest / in the open | Fires only allowed in permanent campfire sites, due caution to be exercised in all cases | AI, AR, BL, BS, GE, LU, NW, OW, VD, ZG |
| Absolute ban on fires in the forest and in the proximity of the forest | Fires allowed elsewhere in the open, due caution to be exercised in all cases | FL, GL, SG (part), UR, VS (most) |
| Absolute ban on fires in the open | No fires allowed in the open | GR (6 features) |

- Example: point in Chur (46.8499, 9.5329): `title_en` "Absolute ban on fires in the open", `description_en` "No fires allowed in the open", `valid_from` "26.06.2026", `canton` "GR". The same point in `ch.bafu.gefahren-waldbrand_warnung`: "High danger", `valid_from` "10.09.2026". Raw output: `/tmp/w/research/_fire_layer_identify.txt`.
- Cross-check VERIFIED: GR's own 05.10.2026 notice (section 3) says the absolute ban remains in Churer Rheintal, Prättigau, Schanfigg, Surselva, Heinzenberg/Domleschg; the layer shows GR "Absolute ban on fires in the open" on 6 features on 06.10.2026 (5 with valid_from 26.06.2026, 1 with 01.10.2026). Bern (RSTA page: "Aktuell sind keine Feuerverbot im Kanton Bern in Kraft.") matches the layer ("Warning ..." type only).
- NOT VERIFIED: what `valid_from` means (date the type took effect vs. date of last update). I found no attribute documentation. The app prints "in force since {date}"; that may overstate precision.
- Authority: BAFU says cantonal rules are decisive; GR adds "Beim Informationsabgleich mit anderen Plattformen wie waldbrandgefahr.ch ... können zeitliche Verzögerungen auftreten. Massgebend für Graubünden ist stets die aktuelle Waldbrandgefahrenkarte des Amtes für Wald und Naturgefahren." Communal bans are not in the layer.

## 3. Cantonal texts (stove / grill language first)

### 3.1 Bern (BE), the only canton that names camping stoves
- **Merkblatt "Feuerverbot im Wald und in Waldesnähe: was gilt?"**, Geschäftsleitung der Regierungsstatthalterinnen und Regierungsstatthalter. URL: https://www.naturgefahren.sites.be.ch/content/dam/naturgefahren_sites/dokumente/de/waldbrand/Merkblatt%20Feuerverbot%20was%20gilt-de.pdf (linked from https://www.rsta.dij.be.ch/de/start/themen/feuerverbot.html; PDF creation date 20.08.2026). Read 2026-10-06.
  - "Das Waldbrandrisiko ist hoch. Im Wald und seinem 50 m - Umkreis sind alle Feuerquellen verboten, die durch direkten Kontakt (Hitze/Flammen) oder mittels Funkenflug einen Brand auslösen könnten."
  - Table (icons read from the rendered PDF page, columns "Feuerverbot im Wald und in Waldesnähe (Mindestabstand 50m)" and "Ausserhalb des Geltungsbereiches des Feuerverbotes"):
    - "Campingkocher und -grill": **red cross inside** the zone, green check with "Erhöhte Vorsicht" outside.
    - "Kohlegrill - Feuerschale", "Offenes Feuer / einfache Feuerstelle", "Feuer in befestigter Feuerstelle (mit betoniertem Boden und seitlich höherer Umrandung)": red cross inside, check with "Erhöhte Vorsicht" outside.
    - "Geschlossener Gasgrill & Metzger-/Profigasgrill (auf feuerfester Unterlage)" and "Elektrogrill": check with "Erhöhte Vorsicht" in both columns.
    - "Raucherwaren wegwerfen", "Feuerwerke, Raketen, Knallkörper", "Höhenfeuer", "Himmelslaterne": red cross in both.
  - Legend: "Wo mit erhöhter Vorsicht noch erlaubt, Feuer immer beobachten und Funkenwurf sofort löschen. Feuerstelle beaufsichtigen, bis Glut komplett ausgekühlt ist. Bei vorherrschendem oder prognostiziertem kräftigem Wind ganz auf Feuer verzichten."
- **Older RSTA leaflet** "Achtung Feuerverbot!" (PDF metadata modified 30.09.2022; https://www.rsta.dij.be.ch/content/dam/rsta_dij/dokumente/de/themen/feuerverbot/RSTA_Waldbrand_Merkblatt_Feuerverbote-was-gilt%20(1).pdf): two scopes, "Feuerverbot im Wald und in Waldesnähe, bis 50 Meter Abstand zum Waldrand. Ausserhalb dieser Verbotszone sind Feuer mit höchster Vorsicht erlaubt." and "Feuerverbot im Freien, die Verbotszone umfasst damit den gesamten Aussenbereich inkl. Siedlungsgebiet." Verboten im jeweiligen Geltungsbereich: "Campingkocher und -grill", "Kohlegrill", "Feuer in befestigter Feuerstelle" ...; "Trotz Feuerverbot ... mit erhöhter Vorsicht erlaubt: Metzger-/Profigasgrill, Elektrogrill". Superseded by the 2026 leaflet for the forest scope; shown because it documents that a ban "im Freien" in Bern also covers camping stoves.
- **Konzept Feuerverbot wegen Waldbrandgefahr im Kanton Bern** (PDF dated 15.04.2026, https://www.rsta.dij.be.ch/content/dam/rsta_dij/dokumente/de/themen/feuerverbot/rsth_konzept_feuerverbot_de.pdf): "Bei Waldbrandgefahr kann die Regierungsstatthalterin oder der Regierungsstatthalter (RSTH) das Feuern und das Abbrennen von Feuerwerk im gesamten gefährdeten Gebiet oder beschränkt auf Wald oder Waldesnähe untersagen (Art. 21 Abs. 3 KWaV). Ein Feuerverbot beinhaltet für das betroffene Gebiet auch ein Feuerwerksverbot sowie ein Verbot von Aktivitäten mit Funkenflug. Ein Feuerverbot im Wald und in Waldesnähe umfasst den Wald samt einem Sicherheitsabstand von 50 m." and "Es kann deshalb verhältnismässig sein ab der erhöhten Gefahrenstufe 3 «ERHEBLICH» bis und mit einer Stufe 5 «SEHR GROSS» Feuerverbote als präventive Massnahme zu erlassen."
- **Law**: Kantonale Waldverordnung (KWaV, BSG 921.111; version in force since 01.01.2023; https://www.belex.sites.be.ch/app/de/texts_of_law/921.111, API read): Art. 21 Abs. 1 "Feuern im Wald ist nur gestattet, soweit alle erforderlichen Massnahmen getroffen sind, um die Entstehung von Feuerschäden auszuschliessen, und das Feuern nicht gemäss Absatz 3 untersagt worden ist." Art. 21 Abs. 3 "Bei Waldbrandgefahr kann die Regierungsstatthalterin oder der Regierungsstatthalter das Feuern und das Abbrennen von Feuerwerk im gesamten gefährdeten Gebiet oder nur im Wald und in Waldesnähe untersagen."
- **Status 2026-10-06**: RSTA page https://www.rsta.dij.be.ch/de/start/themen/feuerverbot.html: "Aktuell sind keine Feuerverbot im Kanton Bern in Kraft."

### 3.2 Graubünden (GR)
- **Law**: Kantonales Waldgesetz (KWaG, BR 920.100; version in force since 01.01.2021; https://www.gr-lex.gr.ch/app/de/texts_of_law/920.100, API read) Art. 31b: "Bei erhöhter Wald- und Flurbrandgefahr ist das Feuern ausserhalb des Siedlungsraums verboten. Der Kanton macht die Gefahrensituation der Öffentlichkeit in angemessener Form bekannt." / "Die Gemeinden können für sichere Feuerstellen ausserhalb des Waldes Ausnahmen vom Feuerverbot verfügen."
- **Press release 28.07.2026** (Standeskanzlei, https://www.gr.ch/DE/Medien/Mitteilungen/MMStaka/2026/Seiten/2026072801.aspx): "In den betroffenen Gebieten sind sämtliche Feuer im Freien verboten. Ebenfalls verboten sind Höhenfeuer, das Abbrennen von Feuerwerkskörpern und das Abfeuern von Raketen. ... Holz- und Holzkohlegrills dürfen nicht verwendet werden. Erlaubt sind einzig Gas- und Elektrogrills auf festem Untergrund und nur unter ständiger Aufsicht. Auch dabei ist grösste Vorsicht geboten." (first release 26.06.2026: "In den betroffenen Gebieten sind sämtliche Feueraktivitäten im Freien untersagt." https://www.gr.ch/DE/Medien/Mitteilungen/MMStaka/2026/Seiten/2026062601.aspx)
- **Current AWN notice 05.10.2026** (https://www.gr.ch/DE/institutionen/verwaltung/diem/awn/aktuelles/Waldbrandgefahr/Seiten/aktuell.aspx): "Aufgrund der Trockenheit bleibt das absolute Feuerverbot im Churer Rheintal sowie in den Regionen Prättigau, Schanfigg, Surselva und Heinzenberg/Domleschg bestehen" / "Erlaubt sind einzig Gas- und Elektrogrills auf festem Untergrund und unter ständiger Aufsicht. Dabei ist jedoch grösste Vorsicht geboten." / "In den übrigen Regionen des Kantons dürfen bezeichnete Feuerstellen nur mit grösster Vorsicht benutzt werden." / "Das Steigenlassen von Himmelslaternen ... ist ganzjährig verboten." / Siedlungsraum excluded from the cantonal ban, communes can be stricter.
- **AWN Infoblatt "Feuerverbot und Waldbrandgefahr in Graubünden"** (for communes, "Ausgabe April 2023"; https://www.gr.ch/DE/institutionen/verwaltung/diem/awn/dokumentenliste_afw/Infoblatt_Umsetzung_Feuerverbot.pdf): "Holz- und Holzkohlegrill sowie Kochmöglichkeiten mit Benzin u.ä. sind überall verboten." / "Hingegen sind Elektro- und Gasgrills auf festem Untergrund und unter permanenter Aufsicht erlaubt, weil kein Funkenflug möglich ist. Diese können bei einem Defekt oder beim Umkippen sofort abgestellt werden und beim Verlassen der Grillstelle bleibt keine Glut zurück." Fire sources listed include "Benzinbetriebene Kochgeräte". Legal basis cited: KWaG Art. 31b Abs. 1, KWaV (GR) Art. 21 Abs. 1. Camping *gas* stoves are not named.

### 3.3 Valais (VS)
- **Communiqué 25.06.2026** (https://www.vs.ch/web/communication/w/tr%C3%A8s-fort-danger-d-incendie-interdiction-g%C3%A9n%C3%A9rale-d-allumer-du-feu-en-plein-air-1): "l'interdiction générale d'allumer du feu en plein air sur tout le territoire cantonal. Les grillades restent toutefois tolérées uniquement dans les espaces privés dans les zones résidentielles/urbaines et sous la responsabilité de la personne qui allume l'installation, ceci pour autant que les grills soient posés sur une base non-inflammable (socle en béton, dallage de pierre…) à au moins 10 mètres d'une surface ou de végétation inflammable (champ, buissons, , etc., 100 mètres pour la forêt)."
- **Conduct table PDF** "Interdiction de faire du feu - Comportements et consignes à respecter" (linked from that communiqué; PDF created 24.06.2026; icons read from the rendered page): "Foyer / Brasero" = red cross in both columns ("Zones urbaines & espaces ouverts", "Forêt + 100 m de distance"); "Barbecue à charbon / Four à pizza et à pain" = allowed with warning only in housing zones, on a non-combustible base; "Barbecue électrique / à gaz" = check with warning in both columns, remark "Faites attention aux risques d'incendie dans les environs et préparez des moyens d'extinction."; "Feux d'altitude" and "Lanternes volantes" = red cross. **No row for camping stoves.**
- **Lifting communiqué 15.09.2026** (https://www.vs.ch/web/communication/e/com-et-media/10108/50936426): the general ban of 25.06.2026 is lifted. "Il est rappelé qu'à partir du degré de danger 4 (fort), tout feu demeure interdit en forêt et à proximité de celle-ci, soit dans un périmètre de 100 mètres. Cette interdiction concerne également les installations et places de grillades situées dans ce périmètre." / "Chaque feu autorisé doit être surveillé en permanence et complètement éteint après usage." / "Les administrations communales ... peuvent édicter des dispositions plus restrictives".
- **Cantonal danger page** (https://www.vs.ch/de/web/sfnp/danger-incendie-foret): "In Zeiten mit grosser oder sehr grosser Gefahr ist es nach kantonalem Gesetz verboten, Feuer zu entfachen." Level "Gross": "Generell keine Feuer im Freien. Fest eingerichtete Feuerstellen (betonierter Boden!) können an von den Behörden bezeichneten Stellen mit aller Vorsicht benutzt werden!" Absolute ban: "Das Feuern im Wald und in Waldesnähe ist absolut verboten! (Behördliche Anordnung) Auch fest eingerichtete Feuerstellen dürfen nicht benutzt werden!"
- The cantonal statute that the page calls "kantonale Waldgesetzgebung" was not read.

### 3.4 Ticino (TI)
- **Decision no. 741-2026.3064 of 6 July 2026** (Sezione forestale; attached PDF to the press release https://www4.ti.ch/tich/area-media/comunicati/dettaglio-comunicato/?NEWS_ID=260256, PDF https://www3.ti.ch/COMUNICAZIONI/260256/20260706_Comunicazione%20inizio%20divieto.pdf, image-only PDF read from the rendered pages): "Oggi, lunedì 06 luglio 2026 alle ore 12.00, entra in vigore il divieto assoluto di accendere fuochi all'aperto." / "La misura ... si estende a tutti i tipi di fuoco all'aperto e a qualsiasi atto che possa causare un principio d'incendio di vegetazione." / "Il divieto è valido su tutto il territorio del Canton Ticino e, in accordo con le autorità forestali grigionesi, anche nel Moesano e in Val Poschiavo." / fines "fino a CHF 20'000.-".
- **Sezione forestale page "Divieto assoluto di accendere fuochi all'aperto"** (https://www4.ti.ch/dt/da/sf/temi/incendi-boschivi/divieto-fuochi-allaperto/divieto-assoluto-di-accendere-fuochi-allaperto): "Quando il divieto è in vigore sono assolutamente vietati tutti i fuochi a fiamma viva, indipendentemente dal luogo di esecuzione e dallo scopo, i fuochi d'artificio e quelli commemorativi e, all'interno dell'area boschiva o nelle sue immediate adiacenze, qualsiasi atto che possa causare un principio d'incendio." / "A debita distanza dall'area forestale o da vegetazione infiammabile sono unicamente permessi i fuochi a scopo alimentare, a condizione che tali attività avvengano facendo capo ad apposite strutture e/o apparecchi costantemente sorvegliati. ... non è possibile indicare una distanza assoluta, ma essa deve oggettivamente precludere la possibilità di accensioni involontarie della vegetazione infiammabile." / "Rimane in ogni caso riservata la facoltà delle autorità competenti di imporre lo spegnimento in ogni tempo e luogo ...". FAQ (https://www4.ti.ch/dt/da/sf/temi/incendi-boschivi/domande-frequenti/domande-frequenti) repeats this for "Posso grigliare quando è in vigore il divieto assoluto di accendere fuochi all'aperto?". **No text names gas stoves or camping stoves.** "Fuochi a fiamma viva" (open flame) vs. "fuochi a scopo alimentare ... apparecchi costantemente sorvegliati" leaves a gas stove undecided.
- **Law**: RLCFo Art. 28 cpv. 1 (https://www3.ti.ch/CAN/RLeggi/public/index.php/raccolta-leggi/legge/num/492): "La Sezione comunica l'inizio e la fine del pericolo d'incendio e di divieto assoluto di accendere fuochi all'aperto ai sensi dell'art. 4 del Regolamento sull'organizzazione della lotta contro gli incendi ... (RaLLI)." RaLLI Art. 4 (https://www3.ti.ch/CAN/RLeggi/public/index.php/raccolta-leggi/legge/num/544): "In caso di divieto assoluto di accensione di fuochi all'aperto, le indicazioni trasmesse per radio e televisione dall'Osservatorio meteorologico di Locarno-Monti su indicazione della Sezione forestale sono vincolanti." The statutes do not define what is covered; the page above does.
- Status: the BAFU layer shows TI "No measures in force" (valid_from 21.08.2026). I did not read a TI notice lifting the 06.07.2026 ban.

### 3.5 Vaud (VD)
- **Standing rule, page "Incendies de forêt"** (https://www.vd.ch/incendies-de-foret): "La loi forestière vaudoise (art.33 LVLFO) interdit d'allumer du feu en forêt et à moins de dix mètres des lisières. Des feux en forêt sont néanmoins tolérés aux endroits prévus à cet effet (places de pique-nique aménagées, couverts forestiers, etc.) et uniquement s'il n'en résulte aucun risque pour la forêt." (statute text itself not read)
- **Decision DJES 9 July 2026** (signed PDF linked from https://www.vd.ch/actualites/communiques-de-presse-de-letat-de-vaud/detail/communique/interdiction-dallumer-des-feux-en-plein-air-et-dutiliser-des-engins-pyrotechniques ; OCR text layer, read together with the HTML communiqué): "L'allumage de feux en plein air est interdit." / "L'utilisation des barbecues et grills à charbon ou à bois est interdit dans l'espace public." / "Les barbecues et grills à gaz et électriques restent autorisés sous la responsabilité de leurs utilisateurs et dans le strict respect des règles de sécurité suivantes, notamment: ... support ininflammable ... surveillance constante ... au minimum 10 mètres des champs, haies et broussailles, et à 100 mètres des forêts." Also point 9: "Les communes sont compétentes pour prononcer des mesures plus restrictives sur leur territoire". **No mention of camping stoves (réchauds).**
- **Decision DJES 28 July 2026** ("interdiction totale"; I read a copy hosted by the commune of Gland, https://www.gland.ch/fileadmin/documents/images/DecCD_P-LE_Decision_CDJES_interdiction_des_feux_en_engins_pyrotechniques_28.07.2026.pdf, not the vd.ch original): same stove/grill logic ("Les barbecues et grills à gaz et électriques restent autorisés dans l'espace privé et public ...", 10 m / 100 m).
- **Revocation 26.08.2026** (https://www.vd.ch/actualites/communiques-de-presse-de-letat-de-vaud/detail/communique/levee-de-linterdiction-dallumer-des-feux-en-plein-air, signed decision PDF read): the 28 July decision and its 10 August addendum are revoked; level 3/5. "Le Canton rappelle que la loi forestière interdit les feux en forêt et à moins de 10 mètres des lisières, sauf dans les endroits spécialement aménagés à cet effet (places à feu officielles)." / "... notamment dans les communes où les feux en forêt restent interdits."
- Date detail: the revocation names the 28 July decision, the 9 July decision is the earlier one; I read both.

## 4. What src/restrictions.ts says today (verbatim, repo not edited)
- Ban branch (line 125): "{what}{canton}, in force since {date}. Do not light fires or use a stove outdoors where the ban applies; check the canton's notice for gas stoves." (shown when the measure title or description matches /\b(ban|prohibit)/i and the title is not "no ban")
- Danger >= 3 branch (line 127): "{region}{title} (valid from {date}).{canton} Avoid open fires; cantons often ban them at this level."
- Info branch (line 132): "Cantons regulate open fires in and near forest; a stove on bare ground is a lower risk but follow any notice. Never leave a fire unattended."
- Failure (line 142): "The forest-fire danger and canton measures could not be loaded. Check the canton's fire notices before lighting any fire or stove."
- Sources shown: only the map link `https://map.geo.admin.ch/?layers=ch.bafu.gefahren-waldbrand_warnung,ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone`.

## 5. Assessment against verified sources

| App text | Status | Why |
|---|---|---|
| "Cantons regulate open fires in and near forest" | VERIFIED | BAFU: cantons are responsible; communes in some cantons |
| "Never leave a fire unattended" | VERIFIED | BAFU Verhaltensempfehlungen "Feuer laufend überwachen ...", GR/VD/VS notices |
| "check the canton's notice for gas stoves" | OK | consistent with BAFU FAQ ("kantonal geregelt") and the fact that gas stoves are named in no text except BE (as Campingkocher) |
| "a stove on bare ground is a lower risk" | NOT VERIFIED, remove | only GR gives a reason for gas/electric *grills* (no sparks, switch off at once, no embers); BE bans Campingkocher in the zone |
| "cantons often ban them at this level (3+)" | NOT VERIFIED as phrased | BAFU: level does not automatically lead to a ban; BE: ban "can be proportionate" from level 3; VS: forest + 100 m prohibited from level 4 |
| "Do not light fires or use a stove outdoors where the ban applies" | safe default, but over-broad and scope-blind | matches BE inside forest+50 m; GR/VD/VS allow gas/electric grills; for "Conditional" and "forest only" types the ban does not cover "everywhere outdoors" |
| Ban detection by regex on English title/description | works for the 5 official types | "Warning ..." and "No measures" contain neither "ban" nor "prohibit"; both ban types match |
| "in force since {date}" | NOT VERIFIED | meaning of `valid_from` undocumented |

## 6. Proposed neutral wording (EN; one line per official measure type; translate DE/FR/IT)

General line to append to every fire message (all VERIFIED): "Fire rules are set by the canton, and in some cantons by the commune; the notice of the canton and commune applies. Check: https://www.waldbrandgefahr.ch/de/kantonale-fachstellen"

- No measures in force: "No cantonal fire measure is listed for this region. Fires are possible with due caution. Forest rules still apply all year (for example, in Vaud fires are prohibited in the forest and within 10 m of its edge except at designated places) and communes can ban fires. Never leave a fire unattended and put it out completely."
- Warning (Mahnung): "The canton asks people to avoid lighting fires in and near forest. This is an appeal, not a ban. Communes can have stricter rules."
- Conditional ban: "Fires are only tolerated at permanently installed fire places. For camping this normally means no fire at your spot. Whether a camping stove is allowed is set by the canton and is not stated on the federal map: ask the commune or forest service and do not assume it is."
- Absolute ban in forest and near forest: "No fires in the forest and in a strip around it (the distance is set by the canton, for example 50 m in Bern, 100 m in Valais). Elsewhere in the open, fires are possible with due caution. In Bern camping stoves are banned inside the ban zone."
- Absolute ban in the open: "No fires in the open. Some cantons still allow gas or electric grills on firm ground under constant supervision (Graubünden). Camping stoves are not named in the notices I read: unless the canton says they are allowed, do not use one."
- Danger level 3 or higher without a ban: "Forest-fire danger is {level}. Cantons can order fire bans from this level; a level alone is not a ban. Check the canton's notice."
- Remove: "a stove on bare ground is a lower risk".
- If the app wants one safe sentence about stoves: "Under a ban, the rules for gas stoves differ by canton and are often not stated: Bern prohibits camping stoves inside the ban zone, Graubünden allows only gas and electric grills on firm ground under constant supervision."
  (canton examples need a review date because notices change; the app should show them only with the date "checked 2026-10-06" or link to the canton page instead)

## 7. NOT VERIFIED (plainly)
1. Whether **camping gas stoves** (Gaskocher, réchaud, fornello) are allowed under a ban in GR, VS, VD, TI or any of the other 21 cantons. No official text I read states it. Only Bern names "Campingkocher und -grill"; Graubünden names petrol cookers as prohibited and gas/electric *grills* as allowed.
2. Rules of the other cantons and Liechtenstein (AG, AI, AR, BL, BS, FR, GE, GL, JU, LU, NE, NW, OW, SG, SH, SO, SZ, TG, UR, ZG, ZH, FL). Not read, only their measure types in the BAFU layer.
3. Valais after 15.09.2026: the layer shows "Absolute ban ... forest and proximity" and "Warning" regions; I read only the 15.09.2026 communiqué and the cantonal danger page, not a notice per region.
4. Whether Ticino lifted its 06.07.2026 ban (layer: no measures since 21.08.2026; no TI lifting notice read). Whether Vaud's layer entry "Conditional ban" (since 26.08.2026) has its own notice (the 26.08.2026 communiqué restates the forest-law rule, which fits).
5. Statute texts of VS ("kantonale Waldgesetzgebung") and VD (LVLFo art. 33) were not read; both rest on the cantonal authority pages quoted above. Federal Waldgesetz (SR 921.0) not read; the competence statement rests on BAFU's page.
6. Meaning of the layer attribute `valid_from`.
7. Communal bans are not in any dataset the app uses; coverage cannot be stated.
8. Fines: only Ticino's (up to CHF 20'000) read; other cantons not.
9. The Bern 2022 leaflet is superseded for the forest scope; I did not find a 2026 Bern document describing the "Feuerverbot im Freien" scope beyond the Konzept sentence (ban "im gesamten gefährdeten Gebiet").
10. VD decision of 28 July 2026 read from a commune-hosted copy, not from vd.ch.

## 8. Raw material
Scratchpad (not in repo): `/tmp/claude-0/-home-user-wildcamp/2dad72b0-e170-5b8a-8edb-d172ada10a4c/scratchpad/raw/fire/` (HTML, PDFs, rendered PNGs, layer JSON). Layer output: `/tmp/w/research/_fire_layer_identify.txt`.

