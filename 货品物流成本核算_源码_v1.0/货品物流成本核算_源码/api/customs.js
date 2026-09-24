const {createCustomsProvider} = require('./_lib/customsProvider');
module.exports = async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const query = String(req.query?.q || '').trim().slice(0,120);
  if (!query) return res.status(400).json({error:'QUERY_REQUIRED'});
  const provider = createCustomsProvider();
  const result = /^\d{4,13}$/.test(query.replace(/\s/g,''))
    ? await provider.searchByHsCode(query.replace(/\s/g,''),{originCountry:'Japan',destinationCountry:'China'})
    : await provider.searchByKeyword(query,{originCountry:'Japan',destinationCountry:'China'});
  if (!result.configured) return res.status(503).json({error:'CUSTOMS_PROVIDER_NOT_CONFIGURED',results:[]});
  return res.status(200).json(result);
};
