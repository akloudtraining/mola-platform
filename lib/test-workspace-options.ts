export const testRoles=[
 {id:'admin',name:'Alex Test',label:'Administrator',role:'President',canReview:false},
 {id:'contributor',name:'Blair Test',label:'Contributor',role:'Member',canReview:false},
 {id:'reviewer',name:'Casey Test',label:'Receipt reviewer',role:'Treasurer',canReview:true},
 {id:'approver',name:'Drew Test',label:'Funding approver',role:'Secretary',canReview:false},
] as const;
