import { describe, expect, it } from 'vitest';
import { lv95ToWgs84 } from '../src/coords';
import {
  MAX_POINTS,
  ascentDescent,
  bounds,
  cumulativeM,
  formatDuration,
  haversineM,
  lengthM,
  mainLine,
  naismithMinutes,
  nearestOnLine,
  parseGpx,
  routeToGpx,
  sampleEvery,
  simplify,
  splitStages,
  type RoutePoint,
} from '../src/route';

// ---------------------------------------------------------------------------------------------
// Samples in the style of the usual exporters
// ---------------------------------------------------------------------------------------------

/** Garmin Connect: prefixed extensions (ns3:), two segments in one track, no metadata name. */
const GARMIN = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Garmin Connect" version="1.1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/11.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <link href="connect.garmin.com"><text>Garmin Connect</text></link>
    <time>2026-07-18T05:12:44.000Z</time>
  </metadata>
  <trk>
    <name>Albula Pass to Bivouac</name>
    <type>hiking</type>
    <trkseg>
      <trkpt lat="46.5796" lon="9.8349"><ele>2315.2</ele><time>2026-07-18T05:13:01.000Z</time><extensions><ns3:TrackPointExtension><ns3:atemp>14.0</ns3:atemp><ns3:hr>96</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>
      <trkpt lat="46.5803" lon="9.8372"><ele>2318.0</ele><time>2026-07-18T05:14:01.000Z</time><extensions><ns3:TrackPointExtension><ns3:hr>101</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>
      <trkpt lat="46.5811" lon="9.8401"><ele>2324.6</ele><time>2026-07-18T05:15:01.000Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="46.5830" lon="9.8450"><ele>2341.9</ele><time>2026-07-18T05:20:01.000Z</time></trkpt>
      <trkpt lat="46.5851" lon="9.8502"><ele>2360.3</ele><time>2026-07-18T05:22:01.000Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** Komoot: single-quoted XML declaration, entity in the name, author link, indented points. */
const KOMOOT = `<?xml version='1.0' encoding='UTF-8'?>
<gpx version="1.1" creator="komoot.de" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Val Trupchun &amp; Jufplaun</name>
    <author>
      <link href="https://www.komoot.com">
        <text>komoot</text>
        <type>text/html</type>
      </link>
    </author>
  </metadata>
  <trk>
    <name>Val Trupchun &amp; Jufplaun</name>
    <trkseg>
      <trkpt lat="46.6291" lon="10.1612">
        <ele>1704.2</ele>
        <time>2026-08-02T06:30:12.000Z</time>
      </trkpt>
      <trkpt lat="46.6270" lon="10.1655">
        <ele>1711.9</ele>
        <time>2026-08-02T06:31:40.000Z</time>
      </trkpt>
      <trkpt lat="46.6244" lon="10.1710">
        <ele>1725.0</ele>
        <time>2026-08-02T06:33:15.000Z</time>
      </trkpt>
      <trkpt lat="46.6201" lon="10.1790">
        <ele>1750.4</ele>
        <time>2026-08-02T06:36:02.000Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** Wikiloc: CDATA names and descriptions, waypoints with cmt/desc/sym/type, Windows line endings. */
const WIKILOC = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3" creator="Wikiloc - https://www.wikiloc.com" version="1.1">
<metadata><name><![CDATA[Fuorcla Surlej – Segantini hut]]></name><desc><![CDATA[Nice <b>day</b> hike & more]]></desc></metadata>
<wpt lat="46.4958" lon="9.8826"><ele>2731</ele><name><![CDATA[Segantini hut]]></name><cmt><![CDATA[Hut with meals]]></cmt><desc><![CDATA[Open June–October. Tel +41 81 842 63 69]]></desc><sym>Lodging</sym><type>Lodging</type></wpt>
<wpt lat="46.4901" lon="9.8702"><ele>2755.5</ele><name><![CDATA[Fuorcla Surlej]]></name><cmt><![CDATA[Saddle with a view]]></cmt><extensions><gpxx:WaypointExtension><gpxx:Proximity>50</gpxx:Proximity></gpxx:WaypointExtension></extensions></wpt>
<trk><name><![CDATA[Fuorcla Surlej – Segantini hut]]></name><extensions><gpxx:TrackExtension><gpxx:DisplayColor>Red</gpxx:DisplayColor></gpxx:TrackExtension></extensions><trkseg>
<trkpt lat="46.4901" lon="9.8702"><ele>2755.5</ele></trkpt>
<trkpt lat="46.4925" lon="9.8750"><ele>2740.1</ele></trkpt>
<trkpt lat="46.4958" lon="9.8826"><ele>2731</ele></trkpt>
</trkseg></trk>
</gpx>`.replace(/\n/g, '\r\n');

/** A route-only file as planning tools write it (rtept names must not confuse the reader). */
const ROUTE_ONLY = `<?xml version="1.0"?>
<gpx version="1.1" creator="map.geo.admin.ch" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Route 1</name>
    <rtept lat="46.8523" lon="9.5302"><ele>1950</ele><name>Start</name></rtept>
    <rtept lat="46.8601" lon="9.5410"/>
    <rtept lat="46.8688" lon="9.5533"><ele>2105</ele></rtept>
  </rte>
</gpx>`;

/** Only waypoints, as a hut or camp-site list. */
const WAYPOINTS_ONLY = `<?xml version="1.0"?>
<gpx version="1.1" creator="Outdooractive" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Huts around Davos</name></metadata>
  <wpt lat="46.7972" lon="9.8293"><ele>1560</ele><name>Hospiz Fl&#252;ela</name><desc>Open all year &amp; cosy</desc></wpt>
  <wpt lat="46.7633" lon="9.9014"><name>Keschhuette</name></wpt>
  <wpt lat="46.8201" lon="9.7710"><ele>2300</ele></wpt>
</gpx>`;

const wrap = (body: string, attrs = 'version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"') => `<?xml version="1.0"?><gpx ${attrs}>${body}</gpx>`;
const trk = (...pts: string[]) => `<trk><trkseg>${pts.join('')}</trkseg></trk>`;

describe('parseGpx: exporters', () => {
  it('Garmin: joins the segments, ignores the prefixed extensions, keeps ele and time', () => {
    const g = parseGpx(GARMIN);
    expect(g.name).toBeUndefined();
    expect(g.routes).toEqual([]);
    expect(g.waypoints).toEqual([]);
    expect(g.tracks).toHaveLength(1);
    const t = g.tracks[0]!;
    expect(t.name).toBe('Albula Pass to Bivouac');
    expect(t.points).toHaveLength(5);
    expect(t.points[0]).toEqual({ lat: 46.5796, lon: 9.8349, ele: 2315.2, time: '2026-07-18T05:13:01.000Z' });
    expect(t.points[3]).toEqual({ lat: 46.583, lon: 9.845, ele: 2341.9, time: '2026-07-18T05:20:01.000Z' });
    expect(t.points[4]!.ele).toBe(2360.3);
    expect(mainLine(g)).toEqual(t.points);
  });

  it('Komoot: decodes the entity in the name, reads metadata and track', () => {
    const g = parseGpx(KOMOOT);
    expect(g.name).toBe('Val Trupchun & Jufplaun');
    expect(g.tracks).toHaveLength(1);
    expect(g.tracks[0]!.name).toBe('Val Trupchun & Jufplaun');
    expect(g.tracks[0]!.points.map((p) => p.ele)).toEqual([1704.2, 1711.9, 1725, 1750.4]);
    expect(g.tracks[0]!.points[2]).toMatchObject({ lat: 46.6244, lon: 10.171 });
  });

  it('Wikiloc: CDATA is taken literally, CRLF is fine, waypoints keep name, ele and desc', () => {
    const g = parseGpx(WIKILOC);
    expect(g.name).toBe('Fuorcla Surlej – Segantini hut');
    expect(g.tracks[0]!.name).toBe('Fuorcla Surlej – Segantini hut');
    expect(g.tracks[0]!.points).toHaveLength(3);
    expect(g.waypoints).toEqual([
      { lat: 46.4958, lon: 9.8826, name: 'Segantini hut', ele: 2731, desc: 'Open June–October. Tel +41 81 842 63 69' },
      { lat: 46.4901, lon: 9.8702, name: 'Fuorcla Surlej', ele: 2755.5, desc: 'Saddle with a view' }, // desc falls back to cmt
    ]);
  });

  it('a route-only file gives routes, no tracks, and mainLine falls back to the route', () => {
    const g = parseGpx(ROUTE_ONLY);
    expect(g.tracks).toEqual([]);
    expect(g.routes).toHaveLength(1);
    expect(g.routes[0]!.name).toBe('Route 1');
    expect(g.routes[0]!.points).toEqual([
      { lat: 46.8523, lon: 9.5302, ele: 1950 },
      { lat: 46.8601, lon: 9.541 },
      { lat: 46.8688, lon: 9.5533, ele: 2105 },
    ]);
    expect(mainLine(g)).toBe(g.routes[0]!.points);
  });

  it('a waypoint-only file gives waypoints and an empty main line', () => {
    const g = parseGpx(WAYPOINTS_ONLY);
    expect(g.name).toBe('Huts around Davos');
    expect(g.tracks).toEqual([]);
    expect(g.routes).toEqual([]);
    expect(g.waypoints).toEqual([
      { lat: 46.7972, lon: 9.8293, ele: 1560, name: 'Hospiz Flüela', desc: 'Open all year & cosy' },
      { lat: 46.7633, lon: 9.9014, name: 'Keschhuette' },
      { lat: 46.8201, lon: 9.771, ele: 2300 },
    ]);
    expect(mainLine(g)).toEqual([]);
  });

  it('reads the app’s own waypoint export (name, ele, time ignored, desc, sym ignored)', () => {
    const own = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wildcamp CH" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>Wildcamp CH saved spots</name></metadata>\n  <wpt lat="46.500000" lon="7.760000">\n    <ele>1602</ele>\n    <time>2026-10-04T12:00:00.000Z</time>\n    <name>Kandersteg &#183; 1602 m</name>\n    <desc>Legality 85/100. Guidance only, not legal advice.</desc>\n    <sym>Campground</sym>\n  </wpt>\n</gpx>\n`;
    const g = parseGpx(own);
    expect(g.name).toBe('Wildcamp CH saved spots');
    expect(g.waypoints).toEqual([{ lat: 46.5, lon: 7.76, name: 'Kandersteg · 1602 m', ele: 1602, desc: 'Legality 85/100. Guidance only, not legal advice.' }]);
  });

  it('GPX 1.0 keeps its name directly under the root', () => {
    const g = parseGpx(`<gpx version="1.0" creator="old" xmlns="http://www.topografix.com/GPX/1/0"><name>Old tour</name><trk><name>T</name><trkseg><trkpt lat="46.5" lon="8.1"><ele>1000</ele></trkpt></trkseg></trk></gpx>`);
    expect(g.name).toBe('Old tour');
    expect(g.tracks[0]).toEqual({ name: 'T', points: [{ lat: 46.5, lon: 8.1, ele: 1000 }] });
  });

  it('metadata/name wins over a root-level name', () => {
    const g = parseGpx(wrap('<name>root</name><metadata><name>meta</name></metadata>'));
    expect(g.name).toBe('meta');
  });
});

describe('parseGpx: syntax', () => {
  it('handles a prefixed GPX namespace on every element', () => {
    const g = parseGpx(
      `<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1" version="1.1"><g:trk><g:name>Prefixed</g:name><g:trkseg><g:trkpt lat="46.5" lon="8.1"><g:ele>1200.5</g:ele></g:trkpt><g:trkpt lat="46.51" lon="8.12"/></g:trkseg></g:trk></g:gpx>`,
    );
    expect(g.tracks[0]!.name).toBe('Prefixed');
    expect(g.tracks[0]!.points).toEqual([{ lat: 46.5, lon: 8.1, ele: 1200.5 }, { lat: 46.51, lon: 8.12 }]);
  });

  it.each([
    ['lon first', `<trkpt lon="8.1" lat="46.5"/>`],
    ['single quotes', `<trkpt lat='46.5' lon='8.1'/>`],
    ['mixed quotes and spaces around =', `<trkpt lat = "46.5"   lon= '8.1' />`],
    ['unquoted values', `<trkpt lat=46.5 lon=8.1>`],
    ['unquoted and self-closing', `<trkpt lat=46.5 lon=8.1/>`],
    ['upper-case names', `<TRKPT LAT="46.5" LON="8.1"/>`],
    ['attributes over several lines', `<trkpt\n  lat="46.5"\r\n  lon="8.1"\n/>`],
    ['an extra attribute containing a > sign', `<trkpt id="a>b" lat="46.5" lon="8.1"/>`],
    ['a prefixed attribute next to them', `<trkpt xsi:foo="1" lat="46.5" lon="8.1"/>`],
    ['plus sign and exponent', `<trkpt lat="+4.65e1" lon="+8.1"/>`],
  ])('reads a point with %s', (_label, point) => {
    const g = parseGpx(wrap(trk(point)));
    expect(g.tracks[0]!.points).toEqual([{ lat: 46.5, lon: 8.1 }]);
  });

  it('skips comments, processing instructions and a DOCTYPE with an internal subset', () => {
    const g = parseGpx(
      `<?xml version="1.0"?>\n<?xml-stylesheet href="x.xsl"?>\n<!DOCTYPE gpx [ <!ENTITY a "<trkpt lat='1' lon='1'/>"> ]>\n<!-- <trkpt lat="2" lon="2"/> -->\n<gpx version="1.1"><trk><trkseg><trkpt lat="46.5" lon="8.1"/><!-- <trkpt lat="3" lon="3"/> --></trkseg></trk></gpx>`,
    );
    expect(g.tracks[0]!.points).toEqual([{ lat: 46.5, lon: 8.1 }]);
  });

  it('does not treat markup inside CDATA as elements', () => {
    const g = parseGpx(wrap(`<wpt lat="46.5" lon="8.1"><name><![CDATA[<trkpt lat="1" lon="1"/> & <b>bold</b>]]></name></wpt>`));
    expect(g.waypoints).toEqual([{ lat: 46.5, lon: 8.1, name: '<trkpt lat="1" lon="1"/> & <b>bold</b>' }]);
    expect(g.tracks).toEqual([]);
  });

  it('decodes the five named entities and numeric references, and leaves unknown ones alone', () => {
    const g = parseGpx(wrap(`<wpt lat="46.5" lon="8.1"><name>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#252; &#xFC; &#x1F3D4; &nbsp; &#0; &#xD800; &amp;amp;</name></wpt>`));
    expect(g.waypoints[0]!.name).toBe('A & B <C> "D" \'E\' ü ü \u{1F3D4} &nbsp; &#0; &#xD800; &amp;');
  });

  it('collapses whitespace in names and trims descriptions', () => {
    const g = parseGpx(wrap(`<wpt lat="46.5" lon="8.1"><name>\n   Hut \n   Foo  </name><desc>\n Line one\r\nLine two \n</desc></wpt>`));
    expect(g.waypoints[0]).toMatchObject({ name: 'Hut Foo', desc: 'Line one\nLine two' });
  });

  it('accepts a BOM, leading blank lines and Windows line endings', () => {
    const g = parseGpx('﻿\r\n\r\n' + KOMOOT.replace(/\n/g, '\r\n'));
    expect(g.tracks[0]!.points).toHaveLength(4);
    expect(g.name).toBe('Val Trupchun & Jufplaun');
  });

  it('accepts self-closing containers and empty elements', () => {
    expect(parseGpx(wrap('<trk/><rte/><trk><trkseg/></trk><metadata/><wpt lat="46.5" lon="8.1"/>'))).toEqual({
      tracks: [],
      routes: [],
      waypoints: [{ lat: 46.5, lon: 8.1 }],
    });
  });

  it('survives a stray < in text and unclosed or stray tags', () => {
    const g = parseGpx(wrap(`<wpt lat="46.5" lon="8.1"><name>A < B and a<b</name></wpt><trk><trkseg><trkpt lat="46.5" lon="8.1"><ele>1000</trkpt></x></trkseg></trk>`));
    expect(g.waypoints[0]!.name).toBe('A < B and a<b');
    expect(g.tracks[0]!.points).toEqual([{ lat: 46.5, lon: 8.1, ele: 1000 }]);
  });

  it('skips <extensions> entirely, even when they contain ele, name or points', () => {
    const g = parseGpx(
      wrap(
        `<trk><name>Real</name><extensions><name>EXT</name><trkpt lat="1" lon="1"/></extensions><trkseg>` +
          `<trkpt lat="46.5" lon="8.1"><ele>1000</ele><extensions><ele>9999</ele><x:deep xmlns:x="u"><x:a><x:b/></x:a></x:deep></extensions><time>2026-01-01T00:00:00Z</time></trkpt>` +
          `</trkseg></trk><extensions/><metadata><name>Doc</name></metadata>`,
      ),
    );
    expect(g.name).toBe('Doc');
    expect(g.tracks).toEqual([{ name: 'Real', points: [{ lat: 46.5, lon: 8.1, ele: 1000, time: '2026-01-01T00:00:00Z' }] }]);
  });

  it('keeps several tracks, segments and routes in file order', () => {
    const g = parseGpx(
      wrap(
        `<trk><name>A</name><trkseg><trkpt lat="46.1" lon="8.1"/></trkseg><trkseg><trkpt lat="46.2" lon="8.2"/></trkseg></trk>` +
          `<trk><name>B</name><trkseg><trkpt lat="46.3" lon="8.3"/></trkseg></trk><rte><rtept lat="46.4" lon="8.4"/></rte><rte><rtept lat="46.5" lon="8.5"/></rte>`,
      ),
    );
    expect(g.tracks.map((t) => [t.name, t.points.map((p) => p.lat)])).toEqual([['A', [46.1, 46.2]], ['B', [46.3]]]);
    expect(g.routes.map((r) => r.points[0]!.lat)).toEqual([46.4, 46.5]);
  });
});

describe('parseGpx: junk and broken files', () => {
  it('skips points with missing, non-numeric or out-of-range coordinates, keeps the rest', () => {
    const bad = [
      `<trkpt lat="abc" lon="8.1"/>`,
      `<trkpt lat="46.5"/>`,
      `<trkpt lon="8.1"/>`,
      `<trkpt lat="" lon="8.1"/>`,
      `<trkpt lat="46.5" lon=""/>`,
      `<trkpt lat="46.5abc" lon="8.1"/>`,
      `<trkpt lat="46,5" lon="8,1"/>`,
      `<trkpt lat="NaN" lon="8.1"/>`,
      `<trkpt lat="Infinity" lon="8.1"/>`,
      `<trkpt lat="1e999" lon="8.1"/>`,
      `<trkpt lat="91" lon="8.1"/>`,
      `<trkpt lat="-90.5" lon="8.1"/>`,
      `<trkpt lat="46.5" lon="181"/>`,
      `<trkpt lat="0" lon="0"/>`,
      `<trkpt/>`,
    ];
    const good1 = `<trkpt lat="46.5" lon="8.1"/>`;
    const good2 = `<trkpt lat="46.6" lon="8.2"/>`;
    const g = parseGpx(wrap(trk(good1, ...bad, good2)));
    expect(g.tracks[0]!.points).toEqual([{ lat: 46.5, lon: 8.1 }, { lat: 46.6, lon: 8.2 }]);
  });

  it('drops junk elevation and time values but keeps the point', () => {
    const g = parseGpx(
      wrap(trk(
        `<trkpt lat="46.5" lon="8.1"><ele>n/a</ele><time> </time></trkpt>`,
        `<trkpt lat="46.5" lon="8.2"><ele></ele></trkpt>`,
        `<trkpt lat="46.5" lon="8.3"><ele>-9999</ele></trkpt>`,
        `<trkpt lat="46.5" lon="8.4"><ele>32768</ele></trkpt>`,
        `<trkpt lat="46.5" lon="8.5"><ele>1602m</ele></trkpt>`,
        `<trkpt lat="46.5" lon="8.6"><ele> 1602.5 </ele><time> 2026-01-01T10:00:00Z </time></trkpt>`,
      )),
    );
    expect(g.tracks[0]!.points.map((p) => p.ele)).toEqual([undefined, undefined, undefined, undefined, undefined, 1602.5]);
    expect(g.tracks[0]!.points[0]).toEqual({ lat: 46.5, lon: 8.1 });
    expect(g.tracks[0]!.points[5]!.time).toBe('2026-01-01T10:00:00Z');
  });

  it('skips waypoints with bad coordinates', () => {
    const g = parseGpx(wrap(`<wpt lat="x" lon="8"><name>bad</name></wpt><wpt lat="46.5" lon="8.1"><name>ok</name></wpt>`));
    expect(g.waypoints).toEqual([{ lat: 46.5, lon: 8.1, name: 'ok' }]);
  });

  it('a gpx root without points gives empty arrays (not an error)', () => {
    expect(parseGpx(wrap(''))).toEqual({ tracks: [], routes: [], waypoints: [] });
    expect(parseGpx('<gpx version="1.1"/>')).toEqual({ tracks: [], routes: [], waypoints: [] });
    expect(parseGpx(wrap(trk()))).toEqual({ tracks: [], routes: [], waypoints: [] });
    expect(parseGpx(wrap(`<trk><name>Empty</name><trkseg><trkpt lat="x" lon="y"/></trkseg></trk>`)).tracks).toEqual([]);
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '  \n '],
    ['plain text', 'hello world'],
    ['JSON', '{"type":"FeatureCollection","features":[]}'],
    ['an HTML error page', '<!DOCTYPE html><html><head><title>404</title></head><body><h1>Not found</h1></body></html>'],
    ['KML', '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>x</name></Placemark></Document></kml>'],
    ['a truncated root tag', '<?xml version="1.0"?><gpx version="1.1" creator="x'],
    ['a gpx word in text only', 'this is a gpx file, honest'],
    ['only an XML declaration', '<?xml version="1.0"?>'],
  ])('throws "not a GPX file" for %s', (_label, text) => {
    expect(() => parseGpx(text)).toThrow(new Error('not a GPX file'));
  });

  it('a file cut off in the middle gives the points read so far, without a half-read value', () => {
    const cut = GARMIN.slice(0, GARMIN.indexOf('<ele>2341.9') + '<ele>23'.length); // inside the 4th point's elevation
    const g = parseGpx(cut);
    expect(g.tracks).toHaveLength(1);
    expect(g.tracks[0]!.points).toHaveLength(4);
    expect(g.tracks[0]!.points[3]).toEqual({ lat: 46.583, lon: 9.845 }); // the cut elevation is dropped, not read as 23
    expect(g.tracks[0]!.points[2]!.ele).toBe(2324.6);
  });

  it('a file cut off inside a tag ignores that tag', () => {
    const cut = KOMOOT.slice(0, KOMOOT.indexOf('<trkpt lat="46.6244"') + '<trkpt lat="46.62'.length);
    expect(parseGpx(cut).tracks[0]!.points).toHaveLength(2);
  });

  it('is not fooled by hostile input (entity bombs, huge attribute lists, deep nesting)', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><gpx><wpt lat="46.5" lon="8.1"><name>&c;</name></wpt></gpx>`;
    expect(parseGpx(bomb).waypoints[0]!.name).toBe('&c;');
    const deep = '<a>'.repeat(5000) + wrap(`<wpt lat="46.5" lon="8.1"/>`) + '</a>'.repeat(5000);
    expect(parseGpx(deep).waypoints).toHaveLength(1);
    const manyAttrs = `<gpx ${Array.from({ length: 5000 }, (_, i) => `a${i}="${i}"`).join(' ')}><wpt lat="46.5" lon="8.1"/></gpx>`;
    expect(parseGpx(manyAttrs).waypoints).toHaveLength(1);
  });

  it('thins a file of more than MAX_POINTS points evenly instead of cutting it off', () => {
    expect(MAX_POINTS).toBe(200000);
    const n = MAX_POINTS * 2 + 50;
    const pts: string[] = [];
    for (let i = 0; i < n; i++) pts.push(`<trkpt lat="46.5" lon="${(8 + i * 1e-6).toFixed(6)}"/>`);
    const g = parseGpx(wrap(`<trk><trkseg>${pts.join('')}</trkseg></trk><rte><rtept lat="46.5" lon="9"/></rte><wpt lat="46.5" lon="8.1"><name>after the cap</name></wpt>`));
    const line = g.tracks[0]!.points;
    expect(g.thinned).toBe(true);
    expect(line.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(line.length).toBeGreaterThan(MAX_POINTS / 4);
    // the whole line is kept, start to end: the last point is near the real end, not at the cut
    expect(line[0]!.lon).toBeCloseTo(8, 6);
    expect(line[line.length - 1]!.lon).toBeGreaterThan(8 + (n - 1000) * 1e-6);
    // order is kept and the spacing is even
    for (let i = 1; i < line.length; i++) expect(line[i]!.lon).toBeGreaterThan(line[i - 1]!.lon);
    expect(g.waypoints).toEqual([{ lat: 46.5, lon: 8.1, name: 'after the cap' }]); // waypoints are still read
  });

  it('does not mark a file that fits as thinned or truncated', () => {
    const g = parseGpx(wrap('<trk><trkseg><trkpt lat="46.5" lon="8"/><trkpt lat="46.6" lon="8.1"/></trkseg></trk>'));
    expect(g.thinned).toBeUndefined();
    expect(g.truncated).toBeUndefined();
  });

  it('marks a file that is cut off', () => {
    const full = wrap('<trk><trkseg><trkpt lat="46.5" lon="8"/><trkpt lat="46.6" lon="8.1"/><trkpt lat="46.7" lon="8.2"/></trkseg></trk>');
    const cut = full.slice(0, full.indexOf('<trkpt lat="46.7"') + 12);
    const g = parseGpx(cut);
    expect(g.truncated).toBe(true);
    expect(g.tracks[0]!.points.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mainLine', () => {
  const line = (n: number, dLon: number): RoutePoint[] => Array.from({ length: n }, (_, i) => ({ lat: 46.5, lon: 8 + i * dLon }));
  it('takes the longest track by distance, not by point count', () => {
    const dense = line(50, 0.0001); // ~0.4 km
    const long = line(3, 0.05); // ~7.7 km
    expect(mainLine({ tracks: [{ points: dense }, { points: long }], routes: [], waypoints: [] })).toBe(long);
  });
  it('prefers a track over a longer route, and falls back to the longest route', () => {
    const t = line(2, 0.001);
    const r1 = line(2, 0.1);
    const r2 = line(2, 0.2);
    expect(mainLine({ tracks: [{ points: t }], routes: [{ points: r1 }], waypoints: [] })).toBe(t);
    expect(mainLine({ tracks: [], routes: [{ points: r1 }, { points: r2 }], waypoints: [] })).toBe(r2);
    expect(mainLine({ tracks: [{ points: [] }], routes: [{ points: r1 }], waypoints: [] })).toBe(r1);
  });
  it('is empty when there is nothing', () => {
    expect(mainLine({ tracks: [], routes: [], waypoints: [{ lat: 46, lon: 8 }] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Geometry helpers for the tests
// ---------------------------------------------------------------------------------------------

const RAD = Math.PI / 180;
const M_PER_DEG = (6371008.8 * Math.PI) / 180; // metres per degree of latitude (and of longitude at the equator)

/** A straight line due north, `km` long, as n + 1 evenly spaced points. */
const meridian = (lat0: number, lon: number, km: number, n: number): RoutePoint[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ lat: lat0 + ((km * 1000) / M_PER_DEG) * (i / n), lon }));

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A wandering path heading roughly east, about `stepM` between points. */
function wander(n: number, stepM: number, seed: number): RoutePoint[] {
  const r = rng(seed);
  const pts: RoutePoint[] = [{ lat: 46.6, lon: 8.0 }];
  for (let i = 1; i < n; i++) {
    const heading = (90 + 60 * Math.sin(i / 40) + (r() - 0.5) * 20) * RAD;
    const last = pts[i - 1]!;
    pts.push({
      lat: last.lat + (stepM * Math.cos(heading)) / M_PER_DEG,
      lon: last.lon + (stepM * Math.sin(heading)) / (M_PER_DEG * Math.cos(last.lat * RAD)),
    });
  }
  return pts;
}

/** Elevations along a profile, one point per metre of the given profile, on a fixed line. */
const withEle = (eles: number[]): RoutePoint[] => eles.map((ele, i) => ({ lat: 46.5 + i * 1e-4, lon: 8.1, ele }));

describe('distances', () => {
  const bern = { lat: 46.9489, lon: 7.4391 }; // Bern station
  const zurich = { lat: 47.3779, lon: 8.5403 }; // Zürich HB

  it('Bern to Zürich HB is about 95.6 km as the crow flies', () => {
    const d = haversineM(bern, zurich);
    expect(d).toBeGreaterThan(95600 * 0.99);
    expect(d).toBeLessThan(95600 * 1.01);
  });

  it('a degree of latitude is 111.2 km; a degree of longitude shrinks with the cosine of the latitude', () => {
    expect(haversineM({ lat: 46, lon: 8 }, { lat: 47, lon: 8 })).toBeCloseTo(111195, -1);
    expect(haversineM({ lat: 0, lon: 8 }, { lat: 0, lon: 9 })).toBeCloseTo(111195, -1);
    const at47 = haversineM({ lat: 47, lon: 8 }, { lat: 47, lon: 9 });
    expect(at47 / 111195).toBeCloseTo(Math.cos(47 * RAD), 2); // the circle of latitude is a slightly longer path than the geodesic
  });

  it('is symmetric, zero for the same point, and half the circumference for antipodes', () => {
    expect(haversineM(bern, bern)).toBe(0);
    expect(haversineM(bern, zurich)).toBeCloseTo(haversineM(zurich, bern), 6);
    expect(haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371008.8, 0);
    expect(haversineM({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(Math.PI * 6371008.8, 0);
  });

  it('agrees with plane distances in Swiss LV95 coordinates within 0.3 %', () => {
    const pairs: [[number, number], [number, number]][] = [
      [[2600000, 1200000], [2650000, 1230000]], // Bern to the Emmental
      [[2683000, 1248000], [2760000, 1176000]], // Zürich to the Engadin side
      [[2780000, 1160000], [2790000, 1170000]], // Lower Engadin, short
      [[2485000, 1110000], [2500000, 1120000]], // Geneva, short
    ];
    for (const [a, b] of pairs) {
      const planar = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const geo = haversineM(lv95ToWgs84(a[0], a[1]), lv95ToWgs84(b[0], b[1]));
      expect(Math.abs(geo / planar - 1)).toBeLessThan(0.003);
    }
  });

  it('lengthM and cumulativeM sum the segments', () => {
    const line = meridian(46, 8, 10, 40);
    expect(lengthM(line)).toBeCloseTo(10000, 0);
    const cum = cumulativeM(line);
    expect(cum).toHaveLength(41);
    expect(cum[0]).toBe(0);
    expect(cum[40]).toBeCloseTo(lengthM(line), 6);
    for (let i = 1; i < cum.length; i++) expect(cum[i]!).toBeGreaterThan(cum[i - 1]!);
    expect(lengthM([])).toBe(0);
    expect(lengthM([{ lat: 46, lon: 8 }])).toBe(0);
    expect(cumulativeM([])).toEqual([]);
    expect(cumulativeM([{ lat: 46, lon: 8 }])).toEqual([0]);
  });

  it('measures the Garmin sample like a plane calculation does (about 1.3 km)', () => {
    const line = mainLine(parseGpx(GARMIN));
    let planar = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      planar += Math.hypot((b.lat - a.lat) * M_PER_DEG, (b.lon - a.lon) * M_PER_DEG * Math.cos(((a.lat + b.lat) / 2) * RAD));
    }
    expect(Math.abs(lengthM(line) / planar - 1)).toBeLessThan(0.002);
    expect(lengthM(line)).toBeGreaterThan(1300);
    expect(lengthM(line)).toBeLessThan(1340);
  });
});

describe('bounds', () => {
  it('is the bounding box, or undefined for no points', () => {
    expect(bounds([{ lat: 46.5, lon: 8.2 }, { lat: 46.1, lon: 9.4 }, { lat: 47.0, lon: 7.9 }])).toEqual({ south: 46.1, west: 7.9, north: 47, east: 9.4 });
    expect(bounds([{ lat: 46.5, lon: 8.2 }])).toEqual({ south: 46.5, west: 8.2, north: 46.5, east: 8.2 });
    expect(bounds([])).toBeUndefined();
  });
});

describe('ascentDescent', () => {
  it('is undefined without (enough) elevations', () => {
    expect(ascentDescent([])).toBeUndefined();
    expect(ascentDescent([{}, {}, {}])).toBeUndefined();
    expect(ascentDescent([{ ele: 1000 }, {}])).toBeUndefined();
    expect(ascentDescent([{ ele: 1000 }])).toBeUndefined();
    expect(ascentDescent([{ ele: NaN }, { ele: 1000 }])).toBeUndefined();
  });

  it('counts a steady climb exactly and a steady descent exactly', () => {
    const up = withEle(Array.from({ length: 101 }, (_, i) => 1000 + i * 10));
    expect(ascentDescent(up)).toEqual({ ascentM: 1000, descentM: 0 });
    expect(ascentDescent(up.slice().reverse())).toEqual({ ascentM: 0, descentM: 1000 });
  });

  it('counts a there-and-back hill (the summit is smoothed by about a third of a step)', () => {
    const hill = withEle([...Array.from({ length: 51 }, (_, i) => 1000 + i * 10), ...Array.from({ length: 50 }, (_, i) => 1490 - i * 10)]);
    const r = ascentDescent(hill)!;
    expect(r.ascentM).toBeGreaterThan(490);
    expect(r.ascentM).toBeLessThanOrEqual(500);
    expect(r.descentM).toBeGreaterThan(490);
    expect(r.descentM).toBeLessThanOrEqual(500);
    expect(r.ascentM).toBeCloseTo(r.descentM, 6);
  });

  it('ignores noise on a flat track that a plain sum of steps would count as hundreds of metres', () => {
    const rand = rng(42);
    const flat = withEle(Array.from({ length: 2000 }, () => 1500 + (rand() - 0.5) * 3)); // +-1.5 m
    let naive = 0;
    for (let i = 1; i < flat.length; i++) naive += Math.max(0, flat[i]!.ele! - flat[i - 1]!.ele!);
    expect(naive).toBeGreaterThan(500);
    const r = ascentDescent(flat)!;
    expect(r.ascentM).toBeLessThan(15);
    expect(r.descentM).toBeLessThan(15);
  });

  it('keeps a real climb through the noise within 5 %', () => {
    const rand = rng(7);
    const climb = withEle(Array.from({ length: 1201 }, (_, i) => 1000 + i * 0.5 + (rand() - 0.5) * 4)); // 600 m with +-2 m noise
    const r = ascentDescent(climb)!;
    expect(r.ascentM).toBeGreaterThan(600 * 0.95);
    expect(r.ascentM).toBeLessThan(600 * 1.05);
    expect(r.descentM).toBeLessThan(30);
  });

  it('counts up-and-down sections of a long walk separately', () => {
    // 800 m up, 300 m down, 500 m up: ascent 1300, descent 300
    const prof = [
      ...Array.from({ length: 81 }, (_, i) => 1000 + i * 10),
      ...Array.from({ length: 30 }, (_, i) => 1800 - (i + 1) * 10),
      ...Array.from({ length: 50 }, (_, i) => 1500 + (i + 1) * 10),
    ];
    const r = ascentDescent(withEle(prof))!;
    expect(r.ascentM).toBeGreaterThan(1300 - 20);
    expect(r.ascentM).toBeLessThanOrEqual(1300);
    expect(r.descentM).toBeGreaterThan(300 - 15);
    expect(r.descentM).toBeLessThanOrEqual(300);
  });

  it('skips points without elevation, and the step size can be changed', () => {
    const pts: RoutePoint[] = [{ lat: 46, lon: 8, ele: 1000 }, { lat: 46.001, lon: 8 }, { lat: 46.002, lon: 8, ele: 1010 }, { lat: 46.003, lon: 8, ele: 1020 }];
    expect(ascentDescent(pts)!.ascentM).toBeCloseTo(20, 6);
    const stairs = withEle([1000, 1002, 1004, 1006, 1008, 1010]);
    expect(ascentDescent(stairs)!.ascentM).toBeCloseTo(8, 6); // counted at 1004 and 1008; the last 2 m are under the 3 m step
    expect(ascentDescent(stairs, 1)!.ascentM).toBeCloseTo(10, 6);
    expect(ascentDescent(stairs, 20)!.ascentM).toBe(0);
  });

  it('works on the Garmin sample elevations (about 45 m up)', () => {
    const r = ascentDescent(mainLine(parseGpx(GARMIN)))!;
    expect(r.ascentM).toBeGreaterThan(30);
    expect(r.ascentM).toBeLessThan(46);
    expect(r.descentM).toBe(0);
  });
});

describe('simplify', () => {
  it('reduces a straight line to its end points, which are the original objects', () => {
    const line = meridian(46, 8, 5, 1000);
    const s = simplify(line, 1);
    expect(s).toHaveLength(2);
    expect(s[0]).toBe(line[0]);
    expect(s[1]).toBe(line[1000]);
  });

  it('keeps the corner of a dog-leg', () => {
    const leg1 = Array.from({ length: 51 }, (_, i) => ({ lat: 46, lon: 8 + (i / 50) * 0.0129 })); // ~1 km east
    const leg2 = Array.from({ length: 50 }, (_, i) => ({ lat: 46 + ((i + 1) / 50) * 0.009, lon: 8.0129 })); // ~1 km north
    const s = simplify([...leg1, ...leg2], 5);
    expect(s).toHaveLength(3);
    expect(s[1]).toBe(leg1[50]);
  });

  it('keeps the corners of a square loop that ends where it began', () => {
    const d = 0.01;
    const loop = [
      { lat: 46, lon: 8 }, { lat: 46, lon: 8 + d / 2 }, { lat: 46, lon: 8 + d },
      { lat: 46 + d / 2, lon: 8 + d }, { lat: 46 + d, lon: 8 + d },
      { lat: 46 + d, lon: 8 + d / 2 }, { lat: 46 + d, lon: 8 },
      { lat: 46 + d / 2, lon: 8 }, { lat: 46, lon: 8 },
    ];
    const s = simplify(loop, 20);
    expect(s).toHaveLength(5);
    expect(s[0]).toBe(loop[0]);
    expect(s[4]).toBe(loop[8]);
  });

  it('removes a zigzag smaller than the tolerance and keeps one bigger than it', () => {
    const dLon = 5 / (M_PER_DEG * Math.cos(46 * RAD)); // 5 m
    const zig = Array.from({ length: 201 }, (_, i) => ({ lat: 46 + (i * 20) / M_PER_DEG, lon: 8 + (i % 2 === 0 ? -dLon : dLon) }));
    expect(simplify(zig, 12)).toHaveLength(2);
    expect(simplify(zig, 2).length).toBeGreaterThan(190);
  });

  it('stays within the tolerance of the original, and keeps ele and time', () => {
    const pts = wander(3000, 20, 1).map((p, i) => ({ ...p, ele: 1000 + (i % 50), time: `t${i}` }));
    for (const tol of [3, 10, 50]) {
      const s = simplify(pts, tol);
      expect(s.length).toBeLessThan(pts.length);
      expect(s[0]).toBe(pts[0]);
      expect(s[s.length - 1]).toBe(pts[pts.length - 1]);
      expect(s.every((p) => typeof p.ele === 'number' && typeof p.time === 'string')).toBe(true);
      let worst = 0;
      for (const p of pts) worst = Math.max(worst, nearestOnLine(s, p.lat, p.lon)!.distM);
      expect(worst).toBeLessThanOrEqual(tol * 1.05);
    }
    expect(simplify(pts, 50).length).toBeLessThan(simplify(pts, 3).length); // more tolerance, fewer points
  });

  it('thins a circle to a polygon within tolerance', () => {
    const r = 800;
    const circle = Array.from({ length: 721 }, (_, i) => {
      const a = (i / 720) * 2 * Math.PI;
      return { lat: 46 + (r * Math.cos(a)) / M_PER_DEG, lon: 8 + (r * Math.sin(a)) / (M_PER_DEG * Math.cos(46 * RAD)) };
    });
    const s = simplify(circle, 3);
    expect(s.length).toBeGreaterThan(20);
    expect(s.length).toBeLessThan(80);
    let worst = 0;
    for (const p of circle) worst = Math.max(worst, nearestOnLine(s, p.lat, p.lon)!.distM);
    expect(worst).toBeLessThanOrEqual(3.2);
  });

  it('handles standing still, tiny inputs, and a tolerance of zero', () => {
    const a = { lat: 46, lon: 8 };
    const b = { lat: 46.01, lon: 8.01 };
    expect(simplify([a, { ...a }, { ...a }, b, { ...b }], 1)).toHaveLength(2);
    expect(simplify([], 5)).toEqual([]);
    expect(simplify([a], 5)).toEqual([a]);
    expect(simplify([a, b], 5)).toEqual([a, b]);
    const pts = wander(100, 20, 3);
    const same = simplify(pts, 0);
    expect(same).toEqual(pts);
    expect(same).not.toBe(pts);
    expect(simplify(pts, -5)).toEqual(pts);
    expect(simplify(pts, NaN)).toEqual(pts);
  });

  it('does not change its input', () => {
    const pts = Object.freeze(wander(200, 20, 5).map((p) => Object.freeze(p)));
    expect(() => simplify(pts, 10)).not.toThrow();
  });

  it('copes with 100 000 points quickly', () => {
    const big = wander(100000, 5, 9);
    const t0 = Date.now();
    const s = simplify(big, 5);
    expect(s.length).toBeLessThan(big.length);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('sampleEvery', () => {
  it('spaces points equally along a line and includes the first and last point', () => {
    const line = wander(2000, 15, 11); // ~30 km of wandering
    const total = lengthM(line);
    const s = sampleEvery(line, 500);
    expect(s[0]).toMatchObject({ lat: line[0]!.lat, lon: line[0]!.lon, distM: 0, index: 0 });
    const last = s[s.length - 1]!;
    expect(last).toMatchObject({ lat: line[1999]!.lat, lon: line[1999]!.lon, index: 1999 });
    expect(last.distM).toBeCloseTo(total, 6);
    expect(s).toHaveLength(Math.ceil(total / 500) + 1);
    for (let i = 1; i < s.length - 1; i++) expect(s[i]!.distM - s[i - 1]!.distM).toBeCloseTo(500, 6);
    expect(last.distM - s[s.length - 2]!.distM).toBeLessThanOrEqual(500 + 1e-6); // the last gap is the remainder
  });

  it('spaces the samples within 1 % on the ground too (a gently winding line)', () => {
    // heading 90 +- 15 degrees over ~12 km: bends are far wider than the 500 m spacing
    const line: RoutePoint[] = [{ lat: 46.6, lon: 8.0 }];
    for (let i = 1; i < 1000; i++) {
      const h = (90 + 15 * Math.sin(i / 200)) * RAD;
      const p = line[i - 1]!;
      line.push({ lat: p.lat + (12 * Math.cos(h)) / M_PER_DEG, lon: p.lon + (12 * Math.sin(h)) / (M_PER_DEG * Math.cos(p.lat * RAD)) });
    }
    const s = sampleEvery(line, 500);
    expect(s.length).toBeGreaterThan(20);
    for (let i = 1; i < s.length - 1; i++) expect(Math.abs(haversineM(s[i - 1]!, s[i]!) / 500 - 1)).toBeLessThan(0.01);
    const straight = sampleEvery(meridian(46, 8, 10, 7), 1000); // uneven source points on a straight line
    for (let i = 1; i < straight.length - 1; i++) expect(Math.abs(haversineM(straight[i - 1]!, straight[i]!) / 1000 - 1)).toBeLessThan(0.001);
  });

  it('puts every sample on the segment named by its index', () => {
    const line = wander(500, 20, 12);
    const cum = cumulativeM(line);
    const s = sampleEvery(line, 137);
    let prev = -1;
    for (const p of s) {
      expect(p.index).toBeGreaterThanOrEqual(prev);
      prev = p.index;
      expect(cum[p.index]!).toBeLessThanOrEqual(p.distM + 1e-6);
      if (p.index < line.length - 1) expect(p.distM).toBeLessThanOrEqual(cum[p.index + 1]! + 1e-6);
    }
  });

  it('has no duplicate end point when the length is an exact multiple', () => {
    const line = meridian(46, 8, 10, 10);
    const total = lengthM(line);
    const s = sampleEvery(line, total / 10);
    expect(s).toHaveLength(11);
    expect(s[10]!.distM).toBeCloseTo(total, 6);
    expect(sampleEvery(line, 2000)).toHaveLength(6); // 0, 2, 4, 6, 8, 10 km
    expect(sampleEvery(line, 3000)).toHaveLength(5); // 0, 3, 6, 9 and the end at 10
  });

  it('interpolates elevation between the neighbours, and leaves it out when one is missing', () => {
    const line: RoutePoint[] = [{ lat: 46, lon: 8, ele: 1000 }, { lat: 46.02, lon: 8, ele: 1200 }, { lat: 46.04, lon: 8 }];
    const s = sampleEvery(line, 1000);
    expect(s[1]!.ele).toBeCloseTo(1000 + 200 * (1000 / lengthM(line.slice(0, 2))), 6);
    expect(s[s.length - 1]!.ele).toBeUndefined();
    const lastMid = s.find((p) => p.distM > 2300 && p.index === 1)!;
    expect(lastMid.ele).toBeUndefined(); // between a point with and a point without elevation
  });

  it('copes with a line that stands still, one point, none, and bad spacing', () => {
    expect(sampleEvery([], 100)).toEqual([]);
    expect(sampleEvery([{ lat: 46, lon: 8, ele: 1 }], 100)).toEqual([{ lat: 46, lon: 8, ele: 1, distM: 0, index: 0 }]);
    const still = [{ lat: 46, lon: 8 }, { lat: 46, lon: 8 }, { lat: 46, lon: 8 }];
    expect(sampleEvery(still, 100).map((p) => p.distM)).toEqual([0, 0]);
    const line = meridian(46, 8, 3, 3);
    for (const bad of [0, -5, NaN, Infinity]) {
      const s = sampleEvery(line, bad);
      expect(s.map((p) => p.index)).toEqual([0, 3]);
    }
  });

  it('skips duplicate source points without dividing by zero', () => {
    const line = [{ lat: 46, lon: 8 }, { lat: 46, lon: 8 }, { lat: 46.01, lon: 8 }, { lat: 46.01, lon: 8 }, { lat: 46.02, lon: 8 }];
    const s = sampleEvery(line, 500);
    expect(s.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))).toBe(true);
    expect(s[s.length - 1]!.distM).toBeCloseTo(lengthM(line), 6);
  });
});

describe('splitStages', () => {
  const route = (km: number, n = Math.max(2, Math.round(km * 10))) => meridian(46, 8, km, n);

  it('splits 52 km at about 20 km into three equal stages that add up to the whole', () => {
    const line = wander(5000, 10.4, 21); // ~52 km
    const total = lengthM(line);
    expect(total / 1000).toBeGreaterThan(48);
    expect(total / 1000).toBeLessThan(56);
    const stages = splitStages(line, 20);
    expect(stages).toHaveLength(3);
    expect(stages.reduce((a, s) => a + s.distM, 0)).toBeCloseTo(total, 6);
    for (const s of stages) expect(Math.abs(s.distM - total / 3)).toBeLessThan(50); // snapped to the nearest point
  });

  it('shares boundaries, starts at the first point, ends at the last and has consecutive indices', () => {
    const line = route(52);
    const stages = splitStages(line, 20);
    expect(stages[0]!.startIndex).toBe(0);
    expect(stages[0]!.from).toBe(line[0]);
    expect(stages[0]!.startDistM).toBe(0);
    expect(stages[stages.length - 1]!.endIndex).toBe(line.length - 1);
    expect(stages[stages.length - 1]!.to).toBe(line[line.length - 1]);
    const cum = cumulativeM(line);
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i]!;
      expect(s.endIndex).toBeGreaterThan(s.startIndex);
      expect(s.from).toBe(line[s.startIndex]);
      expect(s.to).toBe(line[s.endIndex]);
      expect(s.distM).toBeCloseTo(cum[s.endIndex]! - cum[s.startIndex]!, 6);
      expect(s.startDistM).toBeCloseTo(cum[s.startIndex]!, 6);
      if (i > 0) expect(s.startIndex).toBe(stages[i - 1]!.endIndex);
    }
  });

  it.each([
    [52, 20, 3],
    [45, 20, 2],
    [29, 20, 2],
    [27, 20, 2],
    [26, 20, 2], // exactly 30 % over one target: another stage
    [25, 20, 1],
    [24, 20, 1],
    [20, 20, 1],
    [10, 20, 1],
    [3, 20, 1],
    [65, 20, 3],
    [66, 20, 4],
    [67, 20, 4],
    [100, 25, 4],
    [120, 15, 8],
  ])('%s km at a %s km target gives %s stage(s)', (km, target, count) => {
    expect(splitStages(route(km), target)).toHaveLength(count);
  });

  it('never leaves a tiny last stage: stages stay within 35 % under and 30 % over the target', () => {
    for (const target of [10, 15, 20, 25]) {
      for (let km = 4; km <= 200; km += 3) {
        const line = route(km, km * 10);
        const stages = splitStages(line, target);
        const total = lengthM(line);
        expect(stages.reduce((a, s) => a + s.distM, 0)).toBeCloseTo(total, 6);
        if (km >= 0.6 * target) {
          for (const s of stages) {
            expect(s.distM).toBeGreaterThan(0.6 * target * 1000);
            expect(s.distM).toBeLessThan(1.4 * target * 1000);
          }
        }
        const lens = stages.map((s) => s.distM);
        expect(Math.max(...lens) - Math.min(...lens)).toBeLessThan(250); // equal within the point spacing
      }
    }
  });

  it('gives one stage for a zero, negative or invalid target', () => {
    const line = route(40);
    for (const bad of [0, -3, NaN, Infinity]) expect(splitStages(line, bad)).toHaveLength(1);
  });

  it('gives fewer stages when the line has too few points to cut', () => {
    const two = [{ lat: 46, lon: 8 }, { lat: 46.45, lon: 8 }]; // 50 km, two points
    const s = splitStages(two, 20);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ startIndex: 0, endIndex: 1 });
    expect(s[0]!.distM).toBeCloseTo(lengthM(two), 6);
    const three = [{ lat: 46, lon: 8 }, { lat: 46.01, lon: 8 }, { lat: 46.45, lon: 8 }];
    const t = splitStages(three, 20); // wants 3 stages, can only cut at the one inner point
    expect(t.length).toBeLessThanOrEqual(2);
    expect(t.reduce((a, x) => a + x.distM, 0)).toBeCloseTo(lengthM(three), 6);
  });

  it('is empty for fewer than two points', () => {
    expect(splitStages([], 20)).toEqual([]);
    expect(splitStages([{ lat: 46, lon: 8 }], 20)).toEqual([]);
  });

  it('splits a real route file', () => {
    const line = mainLine(parseGpx(KOMOOT));
    const stages = splitStages(line, 0.2); // 200 m target on a ~1 km line
    expect(stages.length).toBeGreaterThanOrEqual(2);
    expect(stages.reduce((a, s) => a + s.distM, 0)).toBeCloseTo(lengthM(line), 6);
  });
});

describe('nearestOnLine', () => {
  // two legs: 46.5 N from 8.0 E north to 46.6 N, then east to 8.1 E
  const line: RoutePoint[] = [{ lat: 46.5, lon: 8.0 }, { lat: 46.6, lon: 8.0 }, { lat: 46.6, lon: 8.1 }];
  const leg1 = haversineM(line[0]!, line[1]!);

  it('projects onto the segment, not just onto the vertices', () => {
    const r = nearestOnLine(line, 46.55, 8.002)!;
    expect(r.index).toBe(0);
    expect(r.distM).toBeCloseTo(0.002 * M_PER_DEG * Math.cos(46.55 * RAD), 0); // ~153 m east of the first leg
    expect(Math.abs(r.distM / 152.7 - 1)).toBeLessThan(0.01);
    expect(r.distAlongM).toBeCloseTo(leg1 / 2, -1);
    expect(r.lat).toBeCloseTo(46.55, 4);
    expect(r.lon).toBeCloseTo(8.0, 6);
  });

  it('picks the second leg, with the distance along the line counted over the first', () => {
    const r = nearestOnLine(line, 46.601, 8.05)!;
    expect(r.index).toBe(1);
    expect(r.distM).toBeCloseTo(0.001 * M_PER_DEG, -1); // ~111 m north of it
    const half = haversineM(line[1]!, line[2]!) / 2;
    expect(r.distAlongM).toBeCloseTo(leg1 + half, -1);
  });

  it('clamps to the ends: before the start and beyond the end', () => {
    const before = nearestOnLine(line, 46.49, 8.0)!;
    expect(before.index).toBe(0);
    expect(before.distAlongM).toBe(0);
    expect(before.distM).toBeCloseTo(0.01 * M_PER_DEG, -1);
    const after = nearestOnLine(line, 46.6, 8.12)!;
    expect(after.index).toBe(1);
    expect(after.distAlongM).toBeCloseTo(lengthM(line), 3);
    expect(after.distM).toBeCloseTo(haversineM(line[2]!, { lat: 46.6, lon: 8.12 }), 3);
  });

  it('is zero for a point on the line, including a vertex', () => {
    expect(nearestOnLine(line, 46.6, 8.0)!.distM).toBeCloseTo(0, 3);
    expect(nearestOnLine(line, 46.55, 8.0)!.distM).toBeLessThan(0.01);
  });

  it('agrees with a brute-force search on a dense copy of a wandering line', () => {
    const wl = wander(300, 25, 31);
    const dense = sampleEvery(wl, 1);
    const rand = rng(99);
    for (let k = 0; k < 25; k++) {
      const base = wl[Math.floor(rand() * wl.length)]!;
      const lat = base.lat + (rand() - 0.5) * 0.004;
      const lon = base.lon + (rand() - 0.5) * 0.004;
      let best = Infinity;
      for (const d of dense) best = Math.min(best, haversineM({ lat, lon }, d));
      const r = nearestOnLine(wl, lat, lon)!;
      expect(r.distM).toBeLessThanOrEqual(best + 0.01);
      expect(r.distM).toBeGreaterThan(best - 1.5); // the dense copy is spaced by 1 m
      expect(r.distAlongM).toBeGreaterThanOrEqual(0);
      expect(r.distAlongM).toBeLessThanOrEqual(lengthM(wl) + 1e-6);
    }
  });

  it('handles one point, none, and a stationary segment', () => {
    expect(nearestOnLine([], 46, 8)).toBeUndefined();
    const one = nearestOnLine([{ lat: 46, lon: 8 }], 46.001, 8)!;
    expect(one).toMatchObject({ index: 0, distAlongM: 0, lat: 46, lon: 8 });
    expect(one.distM).toBeCloseTo(111.2, 0);
    const still = nearestOnLine([{ lat: 46, lon: 8 }, { lat: 46, lon: 8 }, { lat: 46.01, lon: 8 }], 46.005, 8.0001)!;
    expect(Number.isFinite(still.distM)).toBe(true);
    expect(still.index).toBe(1);
  });

  it('tells how far a camp is from a loaded route', () => {
    const route = mainLine(parseGpx(KOMOOT));
    const [a, b] = [route[0]!, route[1]!];
    // a camp 30 m to the side of the middle of the first leg (side = perpendicular in a local plane)
    const kx = M_PER_DEG * Math.cos(a.lat * RAD);
    const dx = (b.lon - a.lon) * kx;
    const dy = (b.lat - a.lat) * M_PER_DEG;
    const len = Math.hypot(dx, dy);
    const camp = { lat: (a.lat + b.lat) / 2 + ((dx / len) * 30) / M_PER_DEG, lon: (a.lon + b.lon) / 2 - ((dy / len) * 30) / kx };
    const r = nearestOnLine(route, camp.lat, camp.lon)!;
    expect(r.index).toBe(0);
    expect(Math.abs(r.distM - 30)).toBeLessThan(0.3);
    expect(Math.abs(r.distAlongM / (haversineM(a, b) / 2) - 1)).toBeLessThan(0.01);
  });
});

describe('Naismith and durations', () => {
  it('is 4 km/h plus 10 minutes per 100 m of ascent', () => {
    expect(naismithMinutes(4000, 0)).toBe(60);
    expect(naismithMinutes(0, 100)).toBe(10);
    expect(naismithMinutes(20000, 1000)).toBe(400); // 5 h flat + 100 min climbing
    expect(naismithMinutes(12500, 850)).toBeCloseTo(187.5 + 85, 9);
    expect(naismithMinutes(0, 0)).toBe(0);
  });

  it('does not add time for descent (documented: Langmuir credit and penalty cancel)', () => {
    expect(naismithMinutes(10000, 500, 800)).toBe(naismithMinutes(10000, 500));
    expect(naismithMinutes(10000, 500, 0)).toBe(naismithMinutes(10000, 500));
  });

  it('treats negative and non-finite input as zero', () => {
    expect(naismithMinutes(-5, -5)).toBe(0);
    expect(naismithMinutes(NaN, 100)).toBe(10);
    expect(naismithMinutes(4000, Infinity)).toBe(60);
  });

  it('feeds from a route: distance, ascent and time are plausible together', () => {
    const line = mainLine(parseGpx(KOMOOT));
    const ad = ascentDescent(line)!;
    const t = naismithMinutes(lengthM(line), ad.ascentM, ad.descentM);
    expect(t).toBeGreaterThan(10);
    expect(t).toBeLessThan(30);
  });

  it.each([
    [80, '1 h 20 min'],
    [45, '45 min'],
    [120, '2 h'],
    [61, '1 h 1 min'],
    [60, '1 h'],
    [59.6, '1 h'],
    [59.4, '59 min'],
    [0.4, '0 min'],
    [0, '0 min'],
    [-12, '0 min'],
    [NaN, '0 min'],
    [Infinity, '0 min'],
    [1500, '25 h'],
    [1505.4, '25 h 5 min'],
    [400, '6 h 40 min'],
    [187.5 + 85, '4 h 33 min'],
  ])('formatDuration(%s) is %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

/** Every opened element is closed in order, attributes are quoted, and there is no stray & or <. */
function wellFormed(xml: string): boolean {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(body))) {
    consumed += m[0].length;
    if (m[5] !== undefined) {
      if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) return false;
      continue;
    }
    const [, closing, name, , selfClosing] = m;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else if (!selfClosing) stack.push(name!);
  }
  return consumed === body.length && stack.length === 0;
}

describe('routeToGpx', () => {
  const pts: RoutePoint[] = [
    { lat: 46.8523, lon: 9.5302, ele: 1950.04 },
    { lat: 46.8601, lon: 9.541, ele: 1987.66, time: '2026-08-01T07:00:00Z' },
    { lat: 46.8688123456789, lon: 9.5533 },
  ];
  const wpts = [
    { lat: 46.8601, lon: 9.541, name: 'Night 1: Alp Grüm', ele: 2091.2, desc: 'Flat meadow & spring' },
    { lat: 46.8688, lon: 9.5533, name: 'Night 2: Flüela <pass>' },
  ];
  const gpx = routeToGpx('Engadin "Tour" & more', pts, wpts);

  it('is well-formed GPX 1.1 in the same dress as the app’s other export', () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wildcamp CH" xmlns="http://www.topografix.com/GPX/1/1">')).toBe(true);
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true);
    expect(wellFormed(gpx)).toBe(true);
  });

  it('writes waypoints before the track (GPX 1.1 element order), then one trkseg with all points', () => {
    expect(gpx.indexOf('<wpt ')).toBeGreaterThan(0);
    expect(gpx.indexOf('<wpt ')).toBeLessThan(gpx.indexOf('<trk>'));
    expect(gpx.lastIndexOf('</wpt>')).toBeLessThan(gpx.indexOf('<trk>'));
    expect((gpx.match(/<trkseg>/g) ?? []).length).toBe(1);
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(3);
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(2);
    const wptBlock = gpx.split('<wpt ')[1]!;
    expect(wptBlock.indexOf('<ele>')).toBeLessThan(wptBlock.indexOf('<name>')); // ele, name, desc as in the schema
    expect(wptBlock.indexOf('<name>')).toBeLessThan(wptBlock.indexOf('<desc>'));
  });

  it('escapes names and descriptions', () => {
    expect(gpx).toContain('<name>Engadin &quot;Tour&quot; &amp; more</name>');
    expect(gpx).toContain('<name>Night 2: Flüela &lt;pass&gt;</name>');
    expect(gpx).toContain('<desc>Flat meadow &amp; spring</desc>');
    expect(gpx).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    const nasty = routeToGpx('a\u0000b\u0008c\u000bd', [], [{ lat: 46, lon: 8, name: 'x\u001fy￾z' }]);
    expect(nasty).toContain('<name>abcd</name>');
    expect(nasty).toContain('<name>xyz</name>');
    expect(wellFormed(nasty)).toBe(true);
  });

  it('writes positions to 6 decimals, elevations to 0.1 m and times as given', () => {
    expect(gpx).toContain('<trkpt lat="46.852300" lon="9.530200"><ele>1950</ele></trkpt>');
    expect(gpx).toContain('<trkpt lat="46.860100" lon="9.541000"><ele>1987.7</ele><time>2026-08-01T07:00:00Z</time></trkpt>');
    expect(gpx).toContain('<trkpt lat="46.868812" lon="9.553300"/>');
    expect(gpx).toContain('<ele>2091.2</ele>');
  });

  it('skips points and waypoints with invalid coordinates and omits an empty track', () => {
    const g = routeToGpx(
      'x',
      [{ lat: NaN, lon: 8 }, { lat: 46, lon: 8 }, { lat: 91, lon: 8 }, { lat: 46, lon: Infinity }, { lat: 46, lon: 8.1, ele: NaN }],
      [{ lat: 46, lon: 181, name: 'bad' }, { lat: 46, lon: 8, name: 'good' }],
    );
    expect((g.match(/<trkpt /g) ?? []).length).toBe(2);
    expect(g).not.toContain('<ele>');
    expect(g).toContain('<name>good</name>');
    expect(g).not.toContain('bad');
    const none = routeToGpx('Only waypoints', [], [{ lat: 46, lon: 8, name: 'n' }]);
    expect(none).not.toContain('<trk>');
    expect(none).toContain('<wpt ');
    expect(wellFormed(none)).toBe(true);
    const empty = routeToGpx('Nothing', []);
    expect(empty).not.toContain('<trk>');
    expect(empty).not.toContain('<wpt');
    expect(wellFormed(empty)).toBe(true);
    expect(parseGpx(empty)).toEqual({ name: 'Nothing', tracks: [], routes: [], waypoints: [] });
  });

  it('never writes -0 or exponent notation for elevations', () => {
    const g = routeToGpx('x', [{ lat: 46, lon: 8, ele: -0.01 }, { lat: 46, lon: 8.1, ele: 1e-9 }, { lat: 46, lon: 8.2, ele: -12.34 }]);
    expect(g).toContain('<ele>0</ele>');
    expect(g).toContain('<ele>-12.3</ele>');
    expect(g).not.toMatch(/<ele>-0<|e-/);
  });

  it('round-trips through parseGpx', () => {
    const back = parseGpx(gpx);
    expect(back.name).toBe('Engadin "Tour" & more');
    expect(back.tracks).toHaveLength(1);
    expect(back.tracks[0]!.name).toBe('Engadin "Tour" & more');
    expect(back.tracks[0]!.points).toEqual([
      { lat: 46.8523, lon: 9.5302, ele: 1950 },
      { lat: 46.8601, lon: 9.541, ele: 1987.7, time: '2026-08-01T07:00:00Z' },
      { lat: 46.868812, lon: 9.5533 },
    ]);
    expect(back.routes).toEqual([]);
    expect(back.waypoints).toEqual([
      { lat: 46.8601, lon: 9.541, name: 'Night 1: Alp Grüm', ele: 2091.2, desc: 'Flat meadow & spring' },
      { lat: 46.8688, lon: 9.5533, name: 'Night 2: Flüela <pass>' },
    ]);
    expect(mainLine(back)).toEqual(back.tracks[0]!.points);
  });

  it('round-trips a long track with the length intact', () => {
    const line = wander(4000, 12, 77).map((p, i) => ({ ...p, ele: 1500 + Math.round(300 * Math.sin(i / 200) * 10) / 10 }));
    const back = mainLine(parseGpx(routeToGpx('Long', line, [])));
    expect(back).toHaveLength(line.length);
    expect(Math.abs(lengthM(back) / lengthM(line) - 1)).toBeLessThan(1e-4); // 6 decimals is ~0.1 m
    expect(ascentDescent(back)!.ascentM).toBeCloseTo(ascentDescent(line)!.ascentM, -1);
  });

  it('round-trips the Wikiloc sample (CDATA in, escaped text out, same data)', () => {
    const first = parseGpx(WIKILOC);
    const again = parseGpx(routeToGpx(first.name ?? '', mainLine(first), first.waypoints));
    expect(again.name).toBe(first.name);
    expect(again.waypoints).toEqual(first.waypoints);
    expect(again.tracks[0]!.points).toEqual(first.tracks[0]!.points);
  });
});

describe('densify', () => {
  it('adds points along long gaps so stages can be cut near their target', async () => {
    const { densify, splitStages } = await import('../src/route');
    // two points 132 km apart on a straight line, thinned to nothing in between
    const line = [{ lat: 47, lon: 7, ele: 400 }, { lat: 47, lon: 8.8, ele: 1000 }];
    const dense = densify(line);
    expect(dense.length).toBeGreaterThan(100);
    expect(dense[0]).toEqual(line[0]);
    expect(dense[dense.length - 1]).toEqual(line[1]);
    const lengths = splitStages(dense, 15).map((s) => s.distM / 1000);
    for (const km of lengths) expect(km).toBeGreaterThan(11);
    for (const km of lengths) expect(km).toBeLessThan(19);
  });
});
