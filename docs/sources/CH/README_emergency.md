<!-- Research memo, read 2026-10-06. It backs src/emergency.ts and the emergency page. The page says only what this memo verified:
     112/117/118/144/145 (BAKOM), 1414 and the Rega app (Rega), Valais 144/KWRO, emergency radio 161.300 MHz, the alpine distress signal (SAC).
     1415 (Air-Glaciers) is NOT listed because no authority names it as an emergency number; 1414 is not called free. -->
# r1 (a): Emergency numbers in Switzerland and in the mountains

Researcher memo for Wildcamp CH. All pages read on **2026-10-06** (UTC) via `curl` through the sandbox proxy (HTML converted to text; PDFs via `pdftotext -layout`). Repo not edited. Quotes are verbatim from the page named. Machine-readable list: `/tmp/w/research/r1_emergency.json`.

## 1. Bottom line

- Verified from federal and rescue-organisation sources: **112, 117, 118, 144, 145, 1414**, the **Rega app**, the Rega checklist of what to say, the **Rega emergency radio channel 161.300 MHz**, and the **Alpine distress signal** (as described by the SAC).
- **Valais is different.** Three sources (Rega, the SAC and Alpine Rettung Schweiz) say rescue in Valais is run by the cantonal organisation KWRO/OCVS, reached on **144**; the SAC even writes "Rega: 1414 (im Wallis 144)". A Valais-specific note for the app is therefore supported.
- **1415 (Air-Glaciers) is NOT verified as an official emergency number.** BAKOM lists "1415" only as a number in the paid "Rettungs-, Pannen- und Informationsdienste" range; the holder "Air-Glacier" appears only in Swisscom's commercial tariff list. Air-Glaciers' own FAQ tells people to dial 144 and does not mention 1415. I left it out of the JSON.
- **Do not call 1414 or 1415 "free".** BAKOM: 112, 117, 118, 144, 145, 147 are "gratis"; 1414/1415 are in a range with prices "zwischen 20 Rp. und Fr. 2.-".
- **Do not say 112 works on a phone without SIM.** The BAKOM rule says the opposite.

## 2. Verified facts

### Numbers (BAKOM, federal)
Source S1: https://www.bakom.admin.ch/de/weitere-nummern-kostenpflichtig-oder-gratis (page "Veröffentlicht am 22. Mai 2024"); FR https://www.bakom.admin.ch/fr/autres-numeros-payants-ou-gratuits ("Publié le 22 mai 2024"); IT https://www.bakom.admin.ch/it/altri-numeri-a-pagamento-o-gratuiti ("Pubblicato il 22 maggio 2024").

| Number | German (verbatim) | French (verbatim) | Italian (verbatim) |
|---|---|---|---|
| 112 | "Europäische Notrufnummer (gratis)" | "numéro d'urgence européen (gratuit)" | "servizio d'emergenza europeo (gratuito)" |
| 117 | "Polizeinotruf (gratis)" | "police, appel d'urgence (gratuit)" | "polizia, chiamata d'emergenza (gratuito)" |
| 118 | "Feuerwehrnotruf (gratis)" | "feu, appel d'urgence (gratuit)" | "pompieri, chiamata d'emergenza (gratuito)" |
| 144 | "Sanitätsnotruf (gratis)" | "sanitaire, appel d'urgence (gratuit)" | "servizio sanitario, chiamata d'emergenza (gratuito)" |
| 145 | "Vergiftungsnotruf (gratis)" | "intoxication, appel d'urgence (gratuit)" | "avvelenamento, chiamata d'emergenza (gratuito)" |

- The German page groups these under "Notrufdienste:" and then lists "Rettungs-, Pannen- und Informationsdienste: 140, 1410, 1411, 1414, 1415, 163... (Preise derzeit zwischen 20 Rp. und Fr. 2.- pro Anruf und/oder Minute)". FR: "Services de secours, de dépannage ou d'information: 140, 1410, 1411, 1414, 1415, 163... (tarifs actuels: entre 20 cts et env. Frs 2.-/min. et/ou appel)". IT: "servizi di soccorso stradale e d'informazione meteo: 140, 1410, 1411, 1414, 1415, 163,..." (the Italian wording differs: "road rescue and weather information"; the numbers are the same).
- AEFV Art. 28 (SR 784.104, Stand 2026-07-01, fedlex PDF https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1997/2879_2879_2879/20260701/de/pdf-a/fedlex-data-admin-ch-eli-cc-1997-2879_2879_2879-20260701-de-pdf-a.pdf): "Für jeden der folgenden Notdienste steht eine Kurznummer zur Verfügung: a europäischer Notruf; b. Polizeinotruf; c. Feuerwehrnotruf; d. Sanitätsnotruf." (The article names the services, not the digits.)
- Swisscom's own short-number price list (a company, not an authority; file modified 2026-02-05) https://swisscom.com/content/dam/swisscom/en/res/mobile/subscription-tariffs/prices-for-short-numbers.pdf: "1414 Rega 0.20 per call", "1415 Air-Glacier 0.20 per call", "144 Ambulance No charge".

### What 112 does (BAKOM TAV 1.3, SR 784.101.113/1.3)
Source S3: Ausgabe 19 (12.03.2025, in force 1.5.2025) https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/oce/2025/25/de/pdf-a/fedlex-data-admin-ch-eli-oce-2025-25-de-pdf-a-5.pdf, and the provisional text of Ausgabe 20 (6.5.2026, in force 1.7.2026) https://www.bakom.admin.ch/dam/de/sd-web/pRgh7G-sbH2k/TAV%201.3%20Ausgabe%2020_DE_20260506_provisorisch.pdf. Ziff. 2.3.2 reads the same in both:
- "... den Zugang zur Alarmzentrale der Polizei via europäische Notrufnummer 112 ... gewährleisten."
- 112 must also be forwarded when the inserted SIM is valid but "nicht zur Benützung des Mobilfunknetzes berechtigt" (a SIM of another provider without roaming agreement): "In diesem Fall kann die CLI jedoch nicht übermittelt werden und ein Rückruf ist demnach nicht möglich." (the caller's number is not shown and a call-back is not possible)
- Used-up prepaid SIM: "so muss mindestens der Zugang zur Alarmzentrale der Polizei via europäische Notrufnummer 112 gewährleistet sein."
- **"Notrufe von Mobiltelefonen ohne SIM dürfen nicht weitergeleitet werden."**
- BAKOM page "Notrufdienste" (S2, https://www.bakom.admin.ch/de/notrufdienste, "Veröffentlicht am 7. August 2024"): "Wenn das Mobiltelefon das Signal des eigenen Anbieters nicht empfängt, versucht es, den Notruf über ein anderes, allenfalls vorhandenes Mobilfunknetz abzusetzen." and "Kundinnen und Kunden wird geraten, im Notfall immer zuerst das Mobiltelefon zu nutzen, um die Notrufdienste der Polizei (117), der Feuerwehr (118) und der Sanität (144) zu kontaktieren, weil eine bessere Lokalisierungsmöglichkeit besteht". Also "Bei Notrufen über Mobilfunk müssen seit dem 1. Juli 2022 zusätzlich genauere Standortinformationen übermittelt werden."

### Rega 1414 and the Rega app (Rega, the air-rescue foundation)
Source S4: "Die korrekte Alarmierung" (published 18.05.2020, "Aktualisiert am 16.10.2025") https://www.rega.ch/aktuell/neues-aus-der-rega-welt/detailseite/die-korrekte-alarmierung ; EN https://www.rega.ch/en/news/news-from-the-world-of-rega/detail/how-to-raise-the-alarm-correctly ; FR https://www.rega.ch/fr/actualite/actualite-du-monde-rega/detail/donner-lalarme ; IT https://www.rega.ch/it/attualita/attualita-dal-mondo-rega/dettaglio/dare-lallarme-in-modo-corretto.
- When to call 1414 directly: "Für die Direktalarmierung der Rega gilt die Faustregel: Wenn der Rettungshelikopter schneller beim Patienten eintreffen kann als andere Rettungsmittel, empfiehlt es sich, direkt die Rega-Notrufnummer 1414 zu wählen."
- What to say, "Checkliste": "Wo ist der Unfallort? Wer ist wie vor Ort erreichbar? Was ist genau passiert? Wie viele Personen sind betroffen, wie verletzt? Wie ist die Situation vor Ort? Wie ist das Wetter vor Ort? Sicht? Niederschlag? Wind?" (FR: "Où s'est déroulé l'accident ? Qui peut-on atteindre sur place et comment ? ... Combien de personnes sont concernées, quel type de blessures ? ...")
- App first: "Grundsätzlich empfehlen wir, den Alarm mit der Notfall-App der Rega auszulösen. Die direkte Übermittlung der Koordinaten an die Einsatzzentrale und in der Folge direkt ins Cockpit des Rettungshelikopters spart viel Zeit und erleichtert die Suche nach der Unfallstelle."
- Needs coverage: "Für das erfolgreiche Absetzen eines Alarms mit Ihrem Handy benötigen Sie eine minimale Verbindung mit einem Mobilfunknetz."
- Fallbacks: "Gelingt die Alarmierung mit der Rega-App, über die Notrufnummer «1414» oder den Notfunk nicht, empfehlen wir Ihnen, wenn möglich Ihren Standort zu wechseln, oder zu versuchen, über die europäische Notrufnummer 112 Hilfe zu rufen."
- "keine «falsche Alarmnummer»": "Egal, welche Notrufnummer Sie wählen, professionelle Hilfe erhalten Sie überall und werden bei Bedarf innert Sekunden an die richtige Stelle weitergeleitet."
- Preparation: "... den Akku des Handys aufzuladen und es dann warm und geschützt zu halten ...", "Weiter sollten Sie Ihren Angehörigen, Freunden oder Hüttenwarten immer das Ziel und die Dauer Ihrer bevorstehenden Aktivität mitteilen."
- Helicopter landing: area "25 x 25 Metern, hindernisfrei", "Ungefähr 100 Meter Distanz zur Unfallstelle", secure loose objects, "Nähern Sie sich dem Helikopter erst bei stillstehendem Rotor".
- Rega footer on every page: "In der Schweiz: 1414", from abroad "+41 333 333 333" (EN: "Within Switzerland: 1414 / From abroad: +41 333 333 333").

Source S5: Rega app page https://www.rega.ch/en/our-missions/this-is-how-we-help-you/rega-app (read 2026-10-06):
- "You can alert Rega with a tap of the finger. Your current location is then automatically transmitted to the Rega Operations Center."
- "In addition, a phone connection is set up with the Operations Center and after speaking with the person raising the alarm, the Operations Center initiates the rescue."
- "Important: The prerequisite for using the Rega app is that the "Share My Location" option is enabled in the smartphone settings. In addition, the smartphone must be equipped with a SIM card and at least minimal network coverage must exist. If it is not possible to raise the alarm via the app, Rega can be alerted by calling the emergency number 1414."
- "In the complete absence of any network coverage, it is not possible to raise the alarm and thus it is also not possible to contact the Operations Center by mobile phone."
- Test alarm exists ("use the test alarm feature"); "Raise the alarm for another person" who shared their location; live-location sharing.
- Near the border: "If you find yourself in an emergency situation and are not sure on which side of the Swiss border you are, we recommend that you first contact Rega by using the Rega app. If, on the other hand, you are sure that you are outside Swiss territory, you should call the local rescue services, the European emergency number 112 or the number 911." App available in "Switzerland and Liechtenstein, as well in as the neighbouring countries Germany, Austria, Italy and France".

Source S7: https://www.rega.ch/en/emergency-number-1414: "If you need medical assistance by air in Switzerland, dial the Rega emergency number 1414. Our national operations center answers emergency calls 24 hours a day." Abroad: "+41 333 333 333" for hospital coordination and repatriation (call the local services first).

### Emergency radio (Rega)
Source S6: https://www.rega.ch/en/our-missions/sites-and-infrastructure/emergency-radio: "The emergency radio channel (161.300 MHz) can be used by anyone throughout Switzerland to call out the rescue services in the event of an emergency if this is not possible by telephone." Coverage is not complete: "Rega's emergency channel cannot be used to raise the alarm from every single location in Switzerland." (Same text, in German, on the Alpine Rettung Schweiz page S10.)

### Valais (KWRO/OCVS, 144)
- Rega (S6, same page): "In Canton Valais, the cantonal rescue organisation, KWRO/OCVS, is responsible for rescue missions (phone number 144)."
- Alpine Rettung Schweiz (ARS, a mountain-rescue organisation), S10 https://www.alpinerettung.ch/einsatzkraefte/alarmierung-und-aufgebot : "Die Rettungsorganisation KWRO ist zuständig für Rettungen im Kanton Wallis. Die Alarmierung erfolgt über die Nummer 144." and "Die Sanitätsnotrufzentrale 144 Wallis und die Einsatzzentrale 1414 der Rega sind rund um die Uhr besetzt und stehen in Verbindung miteinander. Ob 1414 oder 144 – über beide Nummern kann Hilfe angefordert werden, unabhängig der Kantonsgrenzen."
- SAC Notfallblatt (S8): "144 Sanitätsnotrufzentrale oder Flugrettung im Kanton Wallis"; SAC "Die Alpen" 2021/06 (S9): "Rega: 1414 (im Wallis 144 )".
- Air-Glaciers FAQ (S11, https://rescue.air-glaciers.ch/en/faq): "Emergency services: Wherever you are in Switzerland, dial 144 (the Swiss emergency services number)." (FR: "composez le 144"). Air Zermatt, 14. April 2025 (S12, https://www.air-zermatt.ch/en/news/144--your-emergency-number-411): "If you dial 144 in Valais, you will reach the cantonal rescue organisation KWRO."

### SAC (Swiss Alpine Club) emergency sheet
Source S8: SAC "Notfallblatt" PDF (PDF metadata: created 2015-12-16, modified 2018-05-18, so older than the Rega page) https://www.sac-cas.ch/fileadmin/Ausbildung_und_Sicherheit/Tourenplanung/Alpinmerkbl%C3%A4tter/Notfallblatt.pdf :
- "Beim Notfall im Gebirge empfiehlt sich die direkte Alarmierung der Luftrettung."
- "Notfallinformationen: Wo, Koordinaten? Wer, Kontaktmöglichkeit? Was ist wie wann passiert, wie viele Patienten? Lokales Wetter? Gefahren für Flugrettung wie Kabel..."
- "Notrufstellen: 1414 REGA, 117 Polizei, 112 internationale Notrufnummer, App Echo 112, Uepaa, iRega" and "144 Sanitätsnotrufzentrale oder Flugrettung im Kanton Wallis"
- "Alarmierungsmittel: Mobiltelefon, SMS senden versuchen bei schlechtem Empfang oder wenig Batterieleistung"; "Funkgerät (E-Kanal 161.300 MHz), Satellitentelefon"

### Alpine distress signal (SAC)
- SAC Notfallblatt (S8): "Alpines Notsignal: 6 x pro Minute Zeichen geben (Rufen, Pfeifen, Blinken, ...) Eine Minute warten, dann wiederholen" and "Antwort 3 x pro Minute Zeichen geben, Eine Minute warten, dann wiederholen".
- SAC "Die Alpen" 2021/06 "Im Notfall auf Empfang" (S9, https://www.sac-cas.ch/de/die-alpen/im-notfall-auf-empfang-33257/): "Man macht während einer Minute (streng genommen 50 Sekunden) alle zehn Sekunden, also sechsmal pro Minute, mit optischen und/oder akustischen Signalen auf sich aufmerksam. Dann folgt eine Minute Pause, darauf folgt wieder sechsmal pro Minute Pfeifen, Rufen, Winken, Blitzen oder Leuchten." The same article is sceptical: "... ist auch heute höchstens eine nette Tradition. (Das Problem: Sobald sie irgendwo am Berg den Lichtkegel einer Stirnlampe sehen, alarmieren besorgte Mitmenschen sofort die Rettungskette ...)". So the signal is a fallback, not a substitute for the phone, and a headlamp signal may trigger a rescue call by others.

### Cost note (Alpine Rettung Schweiz, S10)
"In der Schweiz werden Rettungskosten grundsätzlich dem Patienten weiterverrechnet. Meistens sind Rettungen, Bergungen und Suchaktionen in der Grundversicherung der Krankenversicherung nur mit einem sehr kleinen Betrag gedeckt (CHF 500.–/pro Kalenderjahr)." Air-Glaciers FAQ gives an average of CHF 3,800 per helicopter rescue in 2022 (operator figure, not needed in the app).

## 3. Suggested wording for the app (my proposal, each line backed above)

- "Emergency: 112 (European, reaches the police alarm centre), 117 police, 118 fire, 144 ambulance. In the mountains call Rega 1414 or use the Rega app, which sends your coordinates. In Valais call 144."
- What to say: where (coordinates), who can be reached and how, what happened, how many people and how injured, situation and weather on site (Rega checklist).
- "No signal: move to higher or open ground; emergency radio channel 161.300 MHz where you have a radio; the Alpine distress signal (six signals a minute, answer three) is a last resort."
- Avoid: "free" for 1414; "works without SIM" for 112; "1415".

## 4. NOT VERIFIED

- **1415 as an emergency number of Air-Glaciers.** Only: BAKOM lists 1415 in the paid rescue/breakdown/information range; Swisscom's tariff list names it "Air-Glacier". No authority, Rega, SAC or Air-Glaciers page says the public should dial 1415. Air-Glaciers' own FAQ says dial 144.
- **ch.ch (federal portal) pages on emergency numbers.** The site is a script-rendered app; every URL I tried returned the empty shell or "Error Page (404)", so I could not read it. A search-engine snippet attributed the statement "112 ... connects you with the alarm centre of the police ... also with a foreign SIM or prepaid without credit" to ch.ch; that is not verified from ch.ch itself (the BAKOM/TAV text above does support the police routing and the SIM rules).
- **BAG (Federal Office of Public Health)** pages: not read; BAKOM was the federal source used instead.
- **"International" Alpine distress signal.** The SAC texts call it "Alpines Notsignal" and give the pattern; neither text says it is internationally standardised. I did not find an official Swiss source for that word.
- **Canton of Valais's own page on 144/OCVS:** `vs.ch` timed out from this sandbox. Valais facts rest on Rega, SAC, Alpine Rettung Schweiz and the two helicopter operators.
- **Whether the Alpine distress signal is understood by rescuers in practice:** the SAC article doubts it (quoted above); I have no study.
- **Costs of calls to 1414 from a given mobile plan:** only the BAKOM range and Swisscom's CHF 0.20 are known.
- **Whether `SMS to 144/112` exists:** the SAC sheet says "SMS senden versuchen bei schlechtem Empfang", but I found no official SMS emergency number; BAKOM says text access for people with disabilities is only planned ("Zugang über eine Textfunktion").
