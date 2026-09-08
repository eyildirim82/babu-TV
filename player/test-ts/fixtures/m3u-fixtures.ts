export const M3U_COMPLEX_PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-id="news.intl" tvg-logo="https://example.com/news.png" group-title="News, International" tvg-chno="7" proxy="https://proxy.example.com/fetch",News, International
#KODIPROP:inputstream.adaptive.license_key=ABCDEF01:1234ABCD
#EXTVLCOPT:http-user-agent=BabusTV-Test/1.0
#EXTHTTP:{"Referer":"https://example.com/","X-Test":"from-ext-http"}
https://stream.example.com/live/news.m3u8|Authorization=Bearer%20demo&X-Test=from-pipe&edge-token=abc123
#EXTINF:-1 tvg-id="sports-1" group-title="Sports" channel-number="12",Sports One
https://stream.example.com/live/sports.ts?drmLicense=AABBCCDD:EEFF0011
#EXTINF:-1 group-title="Sports" proxy="false",Sports Two
https://stream.example.com/live/sports-two.ts
#EXTINF:-1 tvg-id="broken-no-url" group-title="Broken",Broken Entry
#EXTINF:-1 tvg-id="music-1" tvg-logo="https://example.com/music.png",Music
https://stream.example.com/music.ts
`;

export const M3U_MALFORMED_ROWS = `#EXTM3U
this is ignored
#EXTINF:-1 tvg-id="missing-url",Missing URL
#EXTVLCOPT:http-user-agent=ignored
#EXTINF:-1 tvg-id="valid" group-title="General",Valid Channel
#EXTHTTP:{not-json}
https://stream.example.com/valid.ts
`;

export const NOT_M3U_DOCUMENT = `[{"name":"Not M3U"}]`;
