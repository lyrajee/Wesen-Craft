const {TrackingProviderError,fetchTrackingSnapshot}=require('./trackingProviders');

function createTrackingHandler(mode,{fetchSnapshot=fetchTrackingSnapshot,log=console.info}={}) {
  return async function handler(req,res) {
    if(req.method!=='POST')return res.setHeader('Cache-Control','private, no-store').status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
    const identifiers=req.body?.identifiers&&typeof req.body.identifiers==='object'?req.body.identifiers:{};
    try{log?.({event:`${mode}_request_started`,provider:mode==='sea'?'AISStream.io':'adsb.fi'});}catch{}
    try {
      const snapshot=await fetchSnapshot(mode,identifiers);
      return res.setHeader('Cache-Control','private, no-store').status(200).json({...snapshot,ok:true,state:snapshot.state||(snapshot.position?'live':mode==='sea'?'no_new_position':'no_live_signal'),position:snapshot.position??null});
    } catch(error) {
      if(error instanceof TrackingProviderError){try{log?.({event:`${mode}_provider_error`,provider:mode==='sea'?'AISStream.io':'adsb.fi',code:error.code,status:error.status});}catch{}return res.setHeader('Cache-Control','private, no-store').status(error.status).json({ok:false,error:error.code});}
      try{log?.({event:`${mode}_provider_error`,provider:mode==='sea'?'AISStream.io':'adsb.fi',code:'PROVIDER_UNAVAILABLE',status:502});}catch{}
      return res.setHeader('Cache-Control','private, no-store').status(502).json({ok:false,error:'PROVIDER_UNAVAILABLE'});
    }
  };
}

module.exports={createTrackingHandler};
