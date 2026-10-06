import type {Entry} from './model';

type ContributionIntent=Pick<Entry,'orgId'|'title'|'memberId'|'amountMinor'|'currency'|'method'|'date'|'reference'|'purpose'|'submissionObligationId'> & {submittedBy:string};
const fields=['orgId','title','memberId','amountMinor','currency','method','date','reference','purpose'] as const;

// A retry can return the existing report only for the same original intent and account.
// Reviews, member display names and later cutoff edits are not new submissions.
export function sameContributionSubmission(saved:Entry,intent:ContributionIntent){
 return saved.type==='contribution'&&saved.submittedBy===intent.submittedBy
  &&fields.every(key=>saved[key]===intent[key])
  &&(saved.submissionObligationId||'')===(intent.submissionObligationId||'');
}
