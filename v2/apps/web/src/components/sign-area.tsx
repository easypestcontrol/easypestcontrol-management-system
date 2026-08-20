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
