// Provider boundary. No tariff source is configured, so no rates are fabricated.
function unavailable() { return {configured:false,results:[],source:null}; }
function createCustomsProvider() {
  return {searchByHsCode: async () => unavailable(), searchByKeyword: async () => unavailable(), getRateDetails: async () => unavailable()};
}
module.exports = {createCustomsProvider};
