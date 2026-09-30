/* ============================================================================
   Handing a destination to Google Maps.

   The app has its own map and its own turn-by-turn. Some people simply know
   Google's better, and on a bad-signal day its cached tiles are the ones that
   load - so every place the app shows a route also offers to open the same
   destination there.

   A universal Maps URL: on a phone it opens the Google Maps app if it is
   installed (the browser otherwise), already set to driving directions from
   wherever the phone is. Coordinates are used when the app has them - the
   customer's marked site, or the address once it has been found on the map -
   because a pin cannot be misread the way an address can.
   ========================================================================== */

export function googleMapsDirections(to: { lat: number; lng: number } | string | null | undefined): string {
  const dest = !to ? ''
    : typeof to === 'string' ? to.trim()
    : to.lat + ',' + to.lng;
  if (!dest) return 'https://www.google.com/maps';
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest)
    + '&travelmode=driving&dir_action=navigate';
}
