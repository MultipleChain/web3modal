const utils = require('./utils');
const wagmiChains = require('@wagmi/core/chains');
const { createWeb3Modal, defaultWagmiConfig } = require('@web3modal/wagmi');
const { 
    watchAccount, 
    getAccount, 
    switchNetwork, 
    fetchToken,
    readContract,
    writeContract,
    sendTransaction, 
    prepareWriteContract,
    prepareSendTransaction,
    getWalletClient
} = require('@wagmi/core');

class Wallet {

    /**
     * @var {object}
     */
    network;

    /**
     * @var {string}
     */
    projectId;

    /**
     * @var {string}
     * dark | light
     * default: light
     */
    themeMode = 'light';

    /**
     * @var {object}
     */
    metadata;

    /**
     * @var {object}
     */
    modal;

    /**
     * @var {Object}
     */
    connectedNetwork;
    
    /**
     * @var {String}
     */
    connectedAccount;

    /**
     * @var {Boolean}
     */
    connecting = false;

    constructor(options) {
        let metadata = this.metadata = options.metadata;
        let projectId = this.projectId = options.projectId;
        let network = this.connectedNetwork = options.network;

        let themeMode = this.themeMode;
        if (options.themeMode) {
            themeMode = this.themeMode = options.themeMode;
        }

        const chains = [Object.values(wagmiChains).find((chain) => chain.id == network.id)];

        const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

        this.modal = createWeb3Modal({ 
            themeMode, 
            wagmiConfig, 
            projectId, 
            chains,
            themeVariables: {
                '--w3m-z-index': 999999999999,
            }
        });
    }

    /**
     * @returns {String}
     */
    getKey() {
        return "web3modal";
    }

    /**
     * @returns {String}
     */
    getName() {
        return "Web3Modal";
    }

    /**
     * @returns {String}
     */
    getSupports() {
        return ['browser', 'mobile'];
    }

    /**
     * @returns {String}
     */
    getDeepLink() {
        return undefined;
    }

    /**
     * @returns {String}
     */
    getDownloadLink() {
        return undefined;
    }

    /**
     * @returns {Boolean}
     */
    isDetected() {
        return undefined;
    }

    /**
     * @param {Object} params
     * @returns {Prmise}
     */
    async request(params) {
        let client = await getWalletClient();
        return client.request(params);
    }

    /**
     * @returns {Object}
     */
    getWalletClient() {
        return getWalletClient();
    }

    /**
     * @returns {void}
     */
    removeOldConnection() {
        this.modal.resetWcConnection();
    }

    /**
     * @returns {String}
     */
    async getChainHexId() {
        const { selectedNetworkId } = this.modal.getState();
        if (utils.isNumeric(selectedNetworkId)) {
            return '0x' + selectedNetworkId.toString(16);
        }
        return selectedNetworkId;
    };

    /**
     * @returns {Boolean}
     */
    async isConnected() {
        return getAccount().isConnected;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                let account = getAccount();
                if (!account.isConnected) {
                    this.modal.open();
                }

                this.modal.subscribeEvents((event) => {
                    if (event.data.event == "CONNECT_ERROR") {
                        utils.rejectMessage(event.data.properties, reject);
                    } else if (event.data.event == "MODAL_CLOSE") {
                        reject('closed-web3modal');
                    }
                });
        
                watchAccount(async account => {
                    if (account.isConnected) {
                        try {
                            const { selectedNetworkId } = this.modal.getState();
                            if (this.connectedNetwork.id != selectedNetworkId) {
                                switchNetwork({
                                    chainId: this.connectedNetwork.id
                                })
                                .then(() => {
                                    resolve(this.connectedAccount = account.address);
                                })
                                .catch((error) => {
                                    utils.rejectMessage(error, reject);
                                });
                            } else {
                                resolve(this.connectedAccount = account.address);
                            }
                        } catch (error) {
                            utils.rejectMessage(error, reject);
                        }
                    }
                })
            } catch (error) {
                utils.rejectMessage(error, reject);
            }
        });
    }

    /**
     * @param {String} to 
     * @param {String} value 
     * @param {Function} onError
     * @returns {String}
     */
    async sendTransaction(to, value, onError = null) {
        let {hash} = await sendTransaction(await prepareSendTransaction({
            to,
            value,
            account: this.connectedAccount,
            onError: (error) => {
                typeof onError == 'function' && onError(error);
            }
        }));

        return hash;
    }

    /**
     * @param {String} to
     * @param {Integer} amount
     * @return {String}
     * @throws {Error}
     */
    coinTransfer(to, amount) {
        return new Promise(async (resolve, reject) => {
            try {
                
                let value = utils.toHex(
                    amount, 
                    this.connectedNetwork.nativeCurrency.decimals
                );

                resolve(await this.sendTransaction(to, value, () => {
                    utils.rejectMessage(error, reject);
                }));
            } catch (error) {
                utils.rejectMessage(error, reject);
            }
        });
    }
/**
     * @param {Object} options 
     * @returns {String}
     */
    async writeContract(options) {
        let {hash} = await writeContract(await prepareWriteContract(options));

        return hash;
    }

    /**
     * @param {String} address 
     * @param {String} functionName 
     * @param {Array} abi 
     * @param  {...any} args 
     * @returns {any}
     */
    async readContract(address, functionName, abi, ...args) {
        return await readContract({
            abi,
            args,
            address,
            functionName,
        })
    }

    /**
     * @param {String} to
     * @param {Integer} amount
     * @return {String}
     * @throws {Error}
     */
    tokenTransfer(to, amount, tokenAddress) {
        return new Promise(async (resolve, reject) => {
            try {
                const token = await fetchToken({
                    address: tokenAddress,
                });

                let value = utils.toHex(
                    amount, 
                    token.decimals
                );

                resolve(await this.writeContract({
                    address: tokenAddress,
                    abi: [{
                        "constant": false,
                        "inputs": [
                            {"name":"_to","type":"address"},
                            {"name":"_value","type":"uint256"}
                        ],
                        "name":"transfer",
                        "outputs": [{"name":"success","type":"bool"}],
                        "stateMutability": "nonpayable",
                        "type": "function"
                    }],
                    functionName: "transfer",
                    args: [
                        to,
                        value
                    ]
                }));
            } catch (error) {
                utils.rejectMessage(error, reject);
            }
        });
    }
}

module.exports = Wallet;