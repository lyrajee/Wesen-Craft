function createProviderStatusHandler(env=process.env){
  return function handler(req,res){
    if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const configured=Boolean(String(env.AISSTREAM_API_KEY||'').trim());
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({configured});
  };
}
module.exports=createProviderStatusHandler();
module.exports.createProviderStatusHandler=createProviderStatusHandler;

