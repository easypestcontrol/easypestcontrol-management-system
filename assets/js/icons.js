/* ==========================================================================
   PestOps — Inline SVG icon set (24x24 stroke, Lucide-style geometry)
   Usage:  ico('calendar')  ->  '<svg ...>...</svg>'
   ========================================================================== */
(function (w) {
  'use strict';

  var P = {
    /* nav & general */
    home:        '<path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    grid:        '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
    activity:    '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    layers:      '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    list:        '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    menu:        '<path d="M3 6h18M3 12h18M3 18h18"/>',
    settings:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.64.73.83.29.17.62.26.96.26H21a2 2 0 1 1 0 4h-.09c-.7 0-1.33.42-1.6 1z"/>',
    sliders:     '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    logout:      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    bell:        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    search:      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    filter:      '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    help:        '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',

    /* actions */
    plus:        '<path d="M12 5v14M5 12h14"/>',
    minus:       '<path d="M5 12h14"/>',
    check:       '<path d="M20 6 9 17l-5-5"/>',
    x:           '<path d="M18 6 6 18M6 6l12 12"/>',
    edit:        '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    trash:       '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/>',
    copy:        '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    printer:     '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    send:        '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    refresh:     '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    rotate:      '<path d="M3 2v6h6"/><path d="M3.5 14a9 9 0 1 0 2.1-9.4L3 8"/>',
    eye:         '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/>',
    link:        '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    external:    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
    pen:         '<path d="M12 19h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2"/><path d="M17 21v-8H7v8M7 3v5h8"/>',

    /* chevrons & arrows */
    cright:      '<path d="m9 18 6-6-6-6"/>',
    cleft:       '<path d="m15 18-6-6 6-6"/>',
    cdown:       '<path d="m6 9 6 6 6-6"/>',
    cup:         '<path d="m18 15-6-6-6 6"/>',
    aright:      '<path d="M5 12h14M12 5l7 7-7 7"/>',
    aleft:       '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    aup:         '<path d="M12 19V5M5 12l7-7 7 7"/>',
    adown:       '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    trendup:     '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    trenddown:   '<path d="M22 17 13.5 8.5 8.5 13.5 2 7"/><path d="M16 17h6v-6"/>',
    dots:        '<circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',

    /* people */
    user:        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:       '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    userplus:    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
    usercheck:   '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>',
    /* simplified so the helmet still reads at 13–14px */
    sparkle:     '<path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
    shuffle:     '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
    undo:        '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-5.7L3 10"/>',
    hardhat:     '<path d="M3 18h18"/><path d="M5.5 18v-4.5a6.5 6.5 0 0 1 13 0V18"/><path d="M9.6 7.5V4.6A1.6 1.6 0 0 1 11.2 3h1.6a1.6 1.6 0 0 1 1.6 1.6v2.9"/>',

    /* business */
    building:    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
    briefcase:   '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    file:        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    filetext:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
    filecheck:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
    receipt:     '<path d="M4 2v20l2.5-1.5L9 22l2.5-1.5L14 22l2.5-1.5L19 22V2l-2.5 1.5L14 2l-2.5 1.5L9 2 6.5 3.5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    card:        '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    rupee:       '<path d="M6 3h12M6 8h12M16.5 3c0 4.4-3.6 8-8 8H6l8 10"/>',
    percent:     '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    tag:         '<path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8"/><path d="M7.5 7.5h.01"/>',
    chart:       '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12.5" y="8" width="3" height="10" rx="1"/><rect x="18" y="4" width="3" height="14" rx="1"/>',
    piechart:    '<path d="M21.2 15.9A10 10 0 1 1 8.1 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    target:      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    award:       '<circle cx="12" cy="8" r="6"/><path d="m8.2 13.5-1.4 8L12 19l5.2 2.5-1.4-8"/>',

    /* ops */
    calendar:    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    calcheck:    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    clock:       '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    timer:       '<path d="M10 2h4"/><path d="M12 14v-4"/><circle cx="12" cy="14" r="8"/>',
    pin:         '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    navigation:  '<path d="m3 11 19-9-9 19-2-8z"/>',
    route:       '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M15 5H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H9"/>',
    truck:       '<path d="M1 3h13v13H1z"/><path d="M14 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/>',
    package:     '<path d="M16.5 9.4 7.5 4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    box:         '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M7.5 8 12 3l4.5 5"/>',
    clipboard:   '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    clipcheck:   '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    shield:      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    shieldcheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    bug:         '<path d="M8 2 9.5 4"/><path d="m16 2-1.5 2"/><path d="M8 6h8a4 4 0 0 1 4 4v4a6 6 0 0 1-12 0v-4a4 4 0 0 1 4-4z"/><path d="M4 11H2M22 11h-2M4 17l2.5-1.5M20 17l-2.5-1.5M4.5 7 7 8.5M19.5 7 17 8.5M12 12v6"/>',
    spray:       '<path d="M6 8h8v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M8 8V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4"/><path d="M17 5h.01M20 3h.01M20 8h.01M17 10h.01"/>',
    droplet:     '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>',
    flask:       '<path d="M9 2v7.5L3.8 18A2 2 0 0 0 5.5 21h13a2 2 0 0 0 1.7-3L15 9.5V2"/><path d="M8 2h8M6.5 15h11"/>',
    wrench:      '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z"/><path d="m14.7 6.3 3-3a4 4 0 0 1 5 5l-3 3"/>',
    zap:         '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    star:        '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    thermometer: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0"/>',

    /* comms & media */
    phone:       '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2"/>',
    whatsapp:    '<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 20.5l1.7-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.6 9.2c.2-.5.5-.5.8-.5h.6c.2 0 .5 0 .7.5l.7 1.7c.1.3 0 .5-.1.7l-.4.5c-.1.2-.3.4-.1.7a6 6 0 0 0 2.9 2.5c.3.1.5 0 .7-.2l.5-.6c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.6 1.6-1.3 1.8-.6.2-1.4.3-4-.8a9.4 9.4 0 0 1-4-3.8c-.4-.7-.8-1.7-.8-2.7 0-1 .4-1.5.6-1.7z"/>',
    mail:        '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2.5 6.5 8.4 5.6a2 2 0 0 0 2.2 0l8.4-5.6"/>',
    message:     '<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 20.5l1.7-5.3A8.5 8.5 0 1 1 21 11.5z"/>',
    camera:      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5l2-3h7l2 3H21a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    image:       '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-5-5L5 21"/>',
    play:        '<path d="M6 3.5 20 12 6 20.5z"/>',
    pause:       '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    stop:        '<rect x="5" y="5" width="14" height="14" rx="2"/>',

    /* status */
    checkcircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    xcircle:     '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    alert:       '<path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3l-8.5-14.7a2 2 0 0 0-3.4 0"/><path d="M12 9v4M12 17h.01"/>',
    alertcircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    lock:        '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    hash:        '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    book:        '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'
  };

  var CACHE = {};

  function ico(name, cls, size) {
    var d = P[name];
    if (!d) { d = P.help; }
    var key = name + '|' + (cls || '') + '|' + (size || '');
    if (CACHE[key]) { return CACHE[key]; }
    var s =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (cls ? ' class="' + cls + '"' : '') +
      (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') +
      '>' + d + '</svg>';
    CACHE[key] = s;
    return s;
  }

  ico.has = function (n) { return !!P[n]; };
  w.ico = ico;
})(window);
