/* What gets printed on a quotation. The bug this replaces put the word
   "Chennai" on a Nagercoil customer's document, so the cases lean on a
   customer whose city is not the branch's.                                */
const printable = (a) => {
  if (!a) return '';
  return [a.attention, a.street1, a.street2,
    [a.city, a.pin].filter(Boolean).join(' '), a.state]
    .map((x) => String(x || '').trim()).filter(Boolean).join('\n');
};
const sitesOf = (c) => {
  if (!c) return [];
  const out = [];
  const list = (c.sites || []).filter((a) => a && a.street1);
  if (list.length) list.forEach((a, i) =>
    out.push({ label: a.label || 'Site ' + (i + 1), text: printable(a) }));
  else if (c.shipping && c.shipping.street1)
    out.push({ label: 'Site address', text: printable(c.shipping) });
  const bill = printable(c.billing);
  if (bill && !out.some((o) => o.text === bill)) out.push({ label: 'Billing address', text: bill });
  return out.filter((o) => o.text);
};

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

/* The customer from the screenshots, exactly as entered */
const jenishlin = {
  billing: { attention: 'Jenishlin', country: 'India', street1: '1/10,Aathikattuvilai',
    street2: 'Kanyakumari District', city: 'Nagercoil', state: 'Tamil Nadu',
    pin: '629501', phone: '7418932321' },
  shipping: { attention: 'Jenishlin', street1: '1/10,Aathikattuvilai',
    street2: 'Kanyakumari District', city: 'Nagercoil', state: 'Tamil Nadu', pin: '629501' },
  sites: [],
};
{
  const t = printable(jenishlin.billing);
  ok('the real street is printed', t.includes('1/10,Aathikattuvilai'), t.replace(/\n/g, ' | '));
  ok('the district is printed', t.includes('Kanyakumari District'));
  ok('city and PIN share a line', t.includes('Nagercoil 629501'));
  ok('CHENNAI IS NOWHERE ON IT', !t.includes('Chennai'), t.replace(/\n/g, ' | '));
  ok('nothing is blank in the middle', !t.includes('\n\n'), JSON.stringify(t));
}

/* Blanks collapse rather than leaving gaps */
{
  const t = printable({ street1: 'Flat 4', city: 'Madurai' });
  ok('a sparse address has no empty lines', t === 'Flat 4\nMadurai', JSON.stringify(t));
  ok('an empty address prints nothing', printable({}) === '' && printable(null) === '');
}

/* Many sites — the picker's list */
{
  const hotel = {
    billing: { street1: 'Head Office, Mount Road', city: 'Chennai', pin: '600002' },
    sites: [
      { label: 'Grand Bay — Besant Nagar', street1: '12 Elliots Beach Rd', city: 'Chennai', pin: '600090' },
      { label: 'Grand Bay — Nagercoil', street1: '9 Cape Rd', city: 'Nagercoil', pin: '629001' },
      { street1: '4 Bypass Rd', city: 'Madurai', pin: '625010' },
    ],
  };
  const picks = sitesOf(hotel);
  ok('every site is offered', picks.length === 4, String(picks.length));
  ok('named sites keep their name', picks[0].label === 'Grand Bay — Besant Nagar', picks[0].label);
  ok('an unnamed site is numbered', picks[2].label === 'Site 3', picks[2].label);
  ok('billing is offered last', picks[3].label === 'Billing address', picks[3].label);
  ok('each carries its own city',
    picks[1].text.includes('Nagercoil') && picks[2].text.includes('Madurai'));

  /* ticking two of them, the way the builder joins */
  const chosen = [picks[0].text, picks[1].text].join('\n\n');
  ok('two sites print as two blocks', chosen.split('\n\n').length === 2);
  ok('and both are complete',
    chosen.includes('Elliots Beach') && chosen.includes('Cape Rd'));
}

/* An older customer with only the single shipping block */
{
  const picks = sitesOf(jenishlin);
  ok('the one site still appears', picks.length >= 1, String(picks.length));
  ok('it is the site, not billing', picks[0].label === 'Site address', picks[0].label);
  ok('a duplicate billing is not offered twice',
    picks.filter((p) => p.text === printable(jenishlin.billing)).length <= 1);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
