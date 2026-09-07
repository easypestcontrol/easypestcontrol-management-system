/* Which document's terms apply.

   Settings keeps four lists because a sales offer, a signed agreement, a
   payment demand and a service report do not say the same thing. The rule
   used to be written out three times and the three disagreed, which is how
   contracts ended up printing the quotation's wording.

   Run:  node terms-test.mjs        (after: tsc -p tsconfig.json)  */
import { docTermsFor } from './dist/terms.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want),
  'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));

const CO = {
  terms: ['Terms aplicable', '7 day credit period'],
  docTerms: { contract: ['bnghnhgbbhg'], quotation: ['Terms aplicable', '7 day credit period'] },
};

console.log('\nThe four lists stay four lists');
eq('a contract prints the contract list', docTermsFor(CO, 'contract'), ['bnghnhgbbhg']);
eq('a quotation prints the quotation list', docTermsFor(CO, 'quotation'),
  ['Terms aplicable', '7 day credit period']);
ok('a contract never prints the quotation list',
  JSON.stringify(docTermsFor(CO, 'contract')) !== JSON.stringify(docTermsFor(CO, 'quotation')));
ok('an invoice falls back to its own built-ins, not the shared column',
  docTermsFor(CO, 'invoice')[0].startsWith('Payment due within 15 days'));
ok('a service report falls back to its own',
  docTermsFor(CO, 'service')[0].includes('licensed applicators'));

console.log('\nA list never written falls back; one emptied on purpose does not');
const never = { terms: ['Legacy line'], docTerms: {} };
eq('contract never set → the legacy column', docTermsFor(never, 'contract'), ['Legacy line']);
eq('quotation never set → the legacy column', docTermsFor(never, 'quotation'), ['Legacy line']);
eq('deleting the last contract term keeps it deleted',
  docTermsFor({ terms: ['Legacy line'], docTerms: { contract: [] } }, 'contract'), []);
eq('deleting the last invoice term keeps it deleted',
  docTermsFor({ terms: ['Legacy line'], docTerms: { invoice: [] } }, 'invoice'), []);

console.log('\nThe edges');
eq('no company at all', docTermsFor(null, 'contract'), []);
eq('no company, invoice still has its built-ins',
  docTermsFor(undefined, 'invoice').length, 3);
eq('docTerms absent entirely', docTermsFor({ terms: ['A'] }, 'contract'), ['A']);
eq('docTerms is not an object', docTermsFor({ terms: ['A'], docTerms: 'nonsense' }, 'contract'), ['A']);
eq('a list with a non-string in it drops the intruder',
  docTermsFor({ docTerms: { contract: ['Real', 7, null, 'Also real'] } }, 'contract'),
  ['Real', 'Also real']);
eq('company with nothing anywhere', docTermsFor({}, 'quotation'), []);

console.log('\nThe live company, as it stands on the server');
eq('its contract terms', docTermsFor(CO, 'contract'), ['bnghnhgbbhg']);
ok('which is what the contract form must now show',
  docTermsFor(CO, 'contract').join() !== CO.terms.join());

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
