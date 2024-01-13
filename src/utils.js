const utils = require('@multiplechain/utils');

module.exports = Object.assign(utils, {
    async rejectMessage(error, reject) {
        console.error(error);
        if (typeof error === 'object') {
            if (error.name == "ContractFunctionExecutionError") {
                return reject('contract-function-error');
            } 
        }
        return reject('request-rejected');
        if (typeof error === 'object') {
            if (error.name == "ContractFunctionExecutionError") {
                reject('contract-function-error');
            } else if (
                error.name == 'UserRejectedRequestError' || 
                error.message.includes('cancel') || 
                error.message.includes('reject') || 
                error.message.includes('User canceled') || 
                error.message.includes('User rejected the request') || 
                error.message.includes('User disapproved requested chains') ||
                error.message.includes('MetaMask Personal Message Signature: User denied message signature') 
            ) {
                return reject('request-rejected');
            } else if (error.name == 'SwitchChainError') {
                return reject('not-accepted-chain');
            } else if (error.message.includes('Already processing eth_requestAccounts')) {
                return reject('already-processing');
            } else if (error.message.includes('An unknown RPC error occurred')) {
                return reject('invalid-rpc-error');
            } else if (error.message.includes('The contract function')) {
                return reject('invalid-contract-address');
            }
        }
        
        return reject(error);
    }
})