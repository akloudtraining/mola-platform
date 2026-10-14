// Cloudflare Worker entry: the vinext app plus an hourly cron for reminder, past-due and
// monthly statement emails (see lib/scheduled-jobs.ts). Pattern from vinext's fetch-handler docs.
import handler from 'vinext/server/fetch-handler';
import {runScheduledJobs} from './lib/scheduled-jobs';

type Fetcher={fetch:(request:Request,env:unknown,ctx:ExecutionContext)=>Response|Promise<Response>};

export default {
 fetch:(request:Request,env:unknown,ctx:ExecutionContext)=>(handler as Fetcher).fetch(request,env,ctx),
 scheduled:(controller:ScheduledController,_env:unknown,ctx:ExecutionContext)=>{ctx.waitUntil(runScheduledJobs(new Date(controller.scheduledTime)));},
};
