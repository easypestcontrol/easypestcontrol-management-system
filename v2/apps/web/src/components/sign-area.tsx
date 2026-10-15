/* The inked part of an "Authorised signatory" block: the admin's signature
   with the round seal beside it, both uploaded once in Settings →
   Organisation and printed on every document. Until they are uploaded the
   block keeps the classic empty gap for a pen. */
export function SignArea({ sign, seal }: { sign?: string; seal?: string }) {
  if (!sign && !seal) return <div className="h-[42px]" />;
  return (
    <div className="h-[56px] flex items-end justify-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {seal && <img src={seal} alt="" className="h-[56px] w-auto object-contain" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {sign && <img src={sign} alt="" className="h-[44px] w-auto object-contain" />}
    </div>
  );
}

/**
 * Where a form used to ask the salesperson to sign for the company: every
 * document carries the COMPANY's signature and seal instead - uploaded once
 * by the admin in Settings -> Organisation - so nobody signs for it by hand.
 */
export function CompanySignNote({ company }: { company: { name?: string; sign?: string; seal?: string } }) {
  const has = !!(company.sign || company.seal);
  return (
    <div className="rounded-lg border border-line bg-white px-3.5 py-3">
      {has ? (
        <div className="flex justify-start"><SignArea sign={company.sign} seal={company.seal} /></div>
      ) : null}
      <p className="text-[12px] text-muted mt-1">
        {has
          ? 'The company signature and seal are printed on the document automatically.'
          : 'No company signature or seal yet - the admin uploads them in Settings → Organisation, and every document carries them.'}
      </p>
    </div>
  );
}
