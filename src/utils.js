const utils = require('@multiplechain/utils');

module.exports = Object.assign(utils, {
    async rejectMessage(error, reject) {
        console.log(error);
        if (typeof error === 'object') {
            if (
                error.name == 'UserRejectedRequestError' || 
                error.message.includes('User rejected the request.')
            ) {
                return reject('request-rejected');
            } else if (error.message.includes('User disapproved requested chains')) {
                return reject('not-accepted-chain');
            }
        }
        
        return reject(error);
    }
})