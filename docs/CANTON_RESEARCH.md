# Canton wild-camping rules: research leads (UNVERIFIED)

**Nothing here has been verified against the primary text.** When this was compiled (2026-10-04) the research tool could only return web-search summaries; every page fetch (cantonal sites, federal sites, the SAC, news outlets) was blocked by the network egress proxy. Summaries are model-written paraphrases, not quotes of the law. Because of that, `src/cantons.ts` contains **no rules yet**, and the app only says "cantonal rules are not verified" for each canton. Do not copy anything below into the app as fact.

## What is reasonably consistent across sources
- There is no federal wild-camping law. It is regulated by cantons and, outside building zones, often by municipalities, so local rules can be stricter.
- Camping is banned or effectively impossible in the Swiss National Park, federal hunting reserves, many nature reserves, bogs and floodplains, and wildlife quiet zones (during their protection period). The app already checks these federal layers.
- SAC (search summary of its leaflet): with no contrary rule, a single night for a few people above the forest line is *"usually unproblematic"* if done considerately. That reads as tolerance, not a legal right. Many articles overstate it as "legal everywhere above the treeline".
- Federal: the forest may be entered freely (ZGB Art. 699, Forest Act), but a BAFU legal opinion (search summary) says forest soil may not be used as a camping site and needs a cantonal exemption (WaG Art. 16 para. 2).

## Per-canton leads
Source type: **official** = a cantonal or federal page/law that appeared in results but was *not read*; **media** = news or blog summary (not acceptable as a source in the app).

| Canton | Lead | Where | Type |
|---|---|---|---|
| OW | Cantonal camping law; summary says camping outside approved campsites is not permitted, with an exception for a single night without permit if no public or private interests are affected; landowner consent for temporary free camping at a residence; absolute camping ban in protected areas | [GDB 971.4 Gesetz über das Campieren](https://gdb.ow.ch/app/de/texts_of_law/971.4), [ow.ch notice](https://www.ow.ch/aktuellesinformationen/126685) | official |
| NW | Leaflet on pitches and camping (2021-11-18). Media say wild camping is banned without landowner consent, with single nights above the forest line (not groups) as an exception; one outlet says groups of more than 5 are excluded | [Merkblatt](https://www.nw.ch/_docn/282097/Merkblatt_Nidwalden_Stellplatze_Camping_18.11.21.pdf) | official + media |
| AI | Camping-tourism report (2025-06), content not examined | [Bericht B4](https://www.ai.ch/themen/wirtschaft-und-arbeit/tourismus/tourismuspolitik/umsetzung-tourismuspolitik/massnahme-b4/download-t1/202506_bericht_b4.pdf/@@download/file/Bericht%20B4.pdf) | official |
| SG | Forestry office leaflet on events under forest law (relevance unclear). Media say individuals and small groups may generally camp in nature | [Merkblatt KFA 2022](https://www.sg.ch/umwelt-natur/wald/bewilligungen-beantragen/veranstaltungen-im-lebensraum/_jcr_content/Par/sgch_downloadlist_982880595/DownloadListPar/sgch_download_764933553.ocFile/Veranstaltungen_nach_Waldgesetzgebung_Merkblatt_KFA_2022-05-02.pdf) | official + media |
| GR | Hunting ordinance BR 740.025 appeared (possibly wildlife-zone rules); media say generally not allowed, with the above-treeline exception, and municipalities can add rules | [JBV](https://www.gr-lex.gr.ch/app/de/texts_of_law/740.025/versions/3447) | official + media |
| SZ | Page on national protected areas | [sz.ch](https://www.sz.ch/umweltdepartement/amt-fuer-wald-und-natur/jagd-und-wildtiere/wildtiere/nationale-schutzgebiete.html/8756-8758-8802-9447-9454-9460-10683-10690) | official |
| VS | Media: generally not allowed; ban on national roads, permit needed on cantonal and municipal roads; building zones handled by the cantonal building commission, elsewhere by municipalities; above-forest-line exception | none | media |
| BE | Media: generally not allowed except one night above the treeline, emergency bivouac, or with landowner permission; the *city* of Bern's camping ordinance reportedly bans tent overnighting in public spaces | none | media |
| TI | Media: generally not allowed except one night in the mountains | none | media |
| JU | Media: generally allowed unless the municipality decides otherwise | none | media |
| ZH, GE, BS | Media: strict | none | media |
| AG | Media widely claim one night is allowed (alongside OW). One article's title says this claim "everyone repeats" is questionable, but it could not be read, so **treat the AG claim as doubtful** | none | media |
| LU, UR, GL, ZG, FR, SO, BL, SH, AR, TG, VD, NE | Nothing found | none | none |

## How to turn a lead into a rule
1. Read the actual law or an official cantonal page (cantonal law collections, `fedlex.admin.ch`). Check: is there a cantonal camping law or ordinance? What does forest or nature-protection law add? Who is responsible outside building zones?
2. Add it to the canton's entry in `src/cantons.ts`:
   ```ts
   { code: 'OW', name: 'Obwalden', rule: {
       stance: 'restricted',            // banned → "Not allowed"; restricted → at most "Caution"
       summary: '…in your own words, matching the law…',
       sources: [{ title: 'GDB 971.4 Gesetz über das Campieren', url: 'https://gdb.ow.ch/app/de/texts_of_law/971.4' }],
       checkedOn: '2026-10-04',          // the day you read it
   } }
   ```
3. `npm test` enforces that sources are https on that canton's official domain (or admin.ch) and that the date is valid. Blog and news links are rejected.
4. Keep municipal rules out of scope for now; the app tells users to check with the municipality.
