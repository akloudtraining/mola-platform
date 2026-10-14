import type {ReactNode} from 'react';

// Mola's own two-tone icon set: a currentColor outline, a faint body tint (.mi-soft)
// and a gold accent (.mi-accent / .mi-accent-stroke). Colours are driven from CSS.
export type MolaIconProps={size?:number;className?:string};

function icon(name:string,body:ReactNode){
  function MolaIcon({size=20,className}:MolaIconProps){
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={'mola-icon'+(className?' '+className:'')}>{body}</svg>;
  }
  MolaIcon.displayName=name;
  return MolaIcon;
}

export const HomeIcon=icon('HomeIcon',<>
  <path className="mi-soft" d="M5.5 10 12 4.6l6.5 5.4v10.5h-13z"/>
  <path d="M5.5 10.2V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-8.8"/>
  <path d="M3.5 11.6 12 4.2l8.5 7.4"/>
  <path className="mi-accent" d="M10 20.5v-4.1a2 2 0 0 1 4 0v4.1z"/>
</>);

export const PaymentsIcon=icon('PaymentsIcon',<>
  <path className="mi-soft" d="M3.5 10a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18z"/>
  <path d="M20.5 11.5V10A2.5 2.5 0 0 0 18 7.5H6A2.5 2.5 0 0 0 3.5 10v8A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-1.5"/>
  <path d="M21 11.5h-4a2 2 0 0 0 0 5h4z"/>
  <circle className="mi-accent" cx="10" cy="4.6" r="2.6"/>
</>);

export const FoundersIcon=icon('FoundersIcon',<>
  <circle className="mi-accent" cx="16.6" cy="8.8" r="2.6"/>
  <path d="M15.4 14.2c2.6-.3 4.6 1.5 5.2 4.6"/>
  <path className="mi-soft" d="M3.6 19.6c.6-3.4 2.8-5.4 5.4-5.4s4.8 2 5.4 5.4z"/>
  <circle cx="9" cy="8" r="3.2"/>
  <path d="M3.6 19.6c.6-3.4 2.8-5.4 5.4-5.4s4.8 2 5.4 5.4"/>
</>);

export const ScheduleIcon=icon('ScheduleIcon',<>
  <rect className="mi-soft" x="3.5" y="5" width="17" height="15.5" rx="3"/>
  <rect x="3.5" y="5" width="17" height="15.5" rx="3"/>
  <path d="M8 3v4M16 3v4M3.5 10h17"/>
  <rect className="mi-accent" x="13.2" y="13" width="4" height="4" rx="1.2"/>
</>);

export const MoreIcon=icon('MoreIcon',<>
  <circle cx="7.5" cy="7.5" r="2.7"/>
  <circle cx="16.5" cy="7.5" r="2.7"/>
  <circle cx="7.5" cy="16.5" r="2.7"/>
  <circle className="mi-accent" cx="16.5" cy="16.5" r="2.7"/>
</>);

export const BankIcon=icon('BankIcon',<>
  <path className="mi-accent" d="M3.5 9.4 12 4l8.5 5.4z"/>
  <path d="M6 12v5.5M10 12v5.5M14 12v5.5M18 12v5.5M3.5 20.3h17"/>
</>);

export const PendingIcon=icon('PendingIcon',<>
  <path d="M6.5 3.5h11M6.5 20.5h11"/>
  <path d="M7.6 3.5c0 4.1 4.4 5.4 4.4 8.5s-4.4 4.4-4.4 8.5M16.4 3.5c0 4.1-4.4 5.4-4.4 8.5s4.4 4.4 4.4 8.5"/>
  <path className="mi-accent" d="M9.3 20.5c.7-2.2 1.8-3.3 2.7-3.3s2 1.1 2.7 3.3z"/>
  <path className="mi-accent" d="M9.8 7.4h4.4c-.7 1.1-1.4 1.7-2.2 2.2-.8-.5-1.5-1.1-2.2-2.2z"/>
</>);

export const SpendingIcon=icon('SpendingIcon',<>
  <path className="mi-soft" d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/>
  <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/>
  <path d="M9 8h6M9 11.5h3.5"/>
  <circle className="mi-accent" cx="14.6" cy="14.6" r="2.3"/>
</>);

export const OpportunityIcon=icon('OpportunityIcon',<>
  <path className="mi-accent" d="m11 3.2 1.9 6.1 6.1 1.9-6.1 1.9L11 19.2l-1.9-6.1L3 11.2l6.1-1.9z"/>
  <path d="M19 3v3.4M17.3 4.7h3.4M18.2 17.2v2.6M16.9 18.5h2.6"/>
</>);

export const GoalIcon=icon('GoalIcon',<>
  <circle className="mi-soft" cx="11" cy="13" r="8"/>
  <circle cx="11" cy="13" r="8"/>
  <circle cx="11" cy="13" r="4.4"/>
  <circle className="mi-accent" cx="11" cy="13" r="1.8"/>
  <path d="m11 13 8.2-8.2M16.4 4.2h3.4v3.4"/>
</>);

export const StatementIcon=icon('StatementIcon',<>
  <path className="mi-soft" d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/>
  <path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/>
  <path className="mi-accent" d="M14 3.5V8h4.5z"/>
  <path d="M8.6 12.5h6.8M8.6 16h4.4"/>
</>);

export const ActivityIcon=icon('ActivityIcon',<>
  <path className="mi-soft" d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"/>
  <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"/>
  <path className="mi-accent" d="M9.8 20.2a2.3 2.3 0 0 0 4.4 0z"/>
</>);

export const ShieldCheckIcon=icon('ShieldCheckIcon',<>
  <path className="mi-soft" d="M12 3.2 19 6v5.5c0 4.4-3 7.8-7 9.3-4-1.5-7-4.9-7-9.3V6z"/>
  <path d="M12 3.2 19 6v5.5c0 4.4-3 7.8-7 9.3-4-1.5-7-4.9-7-9.3V6z"/>
  <path className="mi-accent-stroke" strokeWidth={2} d="m8.9 12.2 2.1 2.1 4.1-4.2"/>
</>);

export const DecisionIcon=icon('DecisionIcon',<>
  <path d="M12 4v16.5M8 20.5h8M5 7.5h14"/>
  <path className="mi-accent" d="M2.8 13.5 5 8.2l2.2 5.3a2.2 2.2 0 0 1-4.4 0z"/>
  <path className="mi-accent" d="M16.8 13.5 19 8.2l2.2 5.3a2.2 2.2 0 0 1-4.4 0z"/>
  <circle cx="12" cy="4" r="1.3"/>
</>);

export const AgreementIcon=icon('AgreementIcon',<>
  <path className="mi-soft" d="M7 3.5h8A1.5 1.5 0 0 1 16.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/>
  <path d="M16.5 9V5A1.5 1.5 0 0 0 15 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>
  <path d="M8.6 8h5M8.6 11.5h3"/>
  <path className="mi-accent" d="M19.6 9.6a1.6 1.6 0 0 1 2.3 2.3l-6.3 6.3-3 .7.7-3z"/>
</>);

export const HelpIcon=icon('HelpIcon',<>
  <path className="mi-soft" d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-4.5 3.8v-3.8H7a3 3 0 0 1-3-3z"/>
  <path d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-4.5 3.8v-3.8H7a3 3 0 0 1-3-3z"/>
  <path d="M10 8.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3"/>
  <circle className="mi-accent" cx="12" cy="13.7" r="1.1"/>
</>);

export const SetupIcon=icon('SetupIcon',<>
  <path d="M4 7h16M4 12h16M4 17h16"/>
  <circle className="mi-accent" cx="9" cy="7" r="2.3"/>
  <circle className="mi-accent" cx="15.5" cy="12" r="2.3"/>
  <circle className="mi-accent" cx="7" cy="17" r="2.3"/>
</>);

export const AccountIcon=icon('AccountIcon',<>
  <circle className="mi-soft" cx="12" cy="12" r="8.5"/>
  <circle cx="12" cy="12" r="8.5"/>
  <circle className="mi-accent" cx="12" cy="10" r="3"/>
  <path d="M6.6 18.2c1.3-2.1 3.1-3.2 5.4-3.2s4.1 1.1 5.4 3.2"/>
</>);
