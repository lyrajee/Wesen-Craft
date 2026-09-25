const {TrackingProviderError,fetchTrackingSnapshot}=require('./trackingProviders');

function createTrackingHandler(mode) {
  return async function handler(req,res) {
    if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const identifiers=req.body?.identifiers&&typeof req.body.identifiers==='object'?req.body.identifiers:{};
    try {
      const snapshot=await fetchTrackingSnapshot(mode,identifiers);
      return res.setHeader('Cache-Control','private, no-store').status(200).json(snapshot);
    } catch(error) {
      if(error instanceof TrackingProviderError)return res.setHeader('Cache-Control','private, no-store').status(error.status).json({error:error.code});
      return res.setHeader('Cache-Control','private, no-store').status(502).json({error:'PROVIDER_UNAVAILABLE'});
    }
  };
}

module.exports={createTrackingHandler};
