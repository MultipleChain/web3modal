const utils = require('./utils');
const wagmiChains = require('@wagmi/core/chains');
const { createWeb3Modal, defaultWagmiConfig } = require('@web3modal/wagmi');
const { 
    disconnect,
    watchAccount, 
    getAccount, 
    switchNetwork, 
    fetchToken,
    readContract,
    writeContract,
    prepareWriteContract,
    getWalletClient,
    getPublicClient
} = require('@wagmi/core');

class Wallet {

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
     * @var {Array}
     */
    networks;

    /**
     * @var {Object}
     */
    connectedNetwork;
    
    /**
     * @var {String}
     */
    connectedAccount;

    constructor(options) {
        let network = options.network;
        let metadata = this.metadata = options.metadata;
        let projectId = this.projectId = options.projectId;

        let themeMode = this.themeMode;
        if (options.themeMode) {
            themeMode = this.themeMode = options.themeMode;
        }

        let chains = [];
        
        if (network) {
            let findedNetwork = chains.find((chain) => {
                if (utils.isNumeric(network)) {
                    return chain.id == network;
                } else {
                    return chain.id == network.id;
                }
            });

            if (!findedNetwork) {
                let defaultRpc = {
                    http: [network.rpcUrl],
                }
                if (network.wsUrl) {
                    defaultRpc.webSocket = [network.wsUrl]
                }

                chains.push(Object.assign({
                    network: network.name,
                    nativeCurrency: {
                        name: network.nativeCurrency.symbol,
                    },
                    rpcUrls: {
                        default: defaultRpc,
                        public: defaultRpc
                    },
                    blockExplorerUrls: {
                        default: {
                            name: network.name,
                            url: network.explorerUrl
                        }
                    },
                }, network))
            } else {
                chains.push(findedNetwork);
            }

            this.connectedNetwork = chains[0];
        }

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

        this.networks = chains;
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
        let client = await this.getWalletClient();
        return client.request(params);
    }

    /**
     * @returns {Object}
     */
    async getWalletClient() {
        let wc = await getWalletClient();
        return wc ? wc : this.getPublicClient();
    }

    /**
     * @returns {Object}
     */
    async getPublicClient() {
        let pc = await getPublicClient();
        if (!pc.account) {
            pc.account = this.connectedAccount;
        }
        return pc;
    }

    /**
     * @returns {void}
     */
    removeOldConnection() {
        Object.keys(localStorage).filter(x => {
            return x.startsWith('wc@2') ||
            x.startsWith('wagmi') ||
            x.startsWith('W3M') ||
            x.startsWith('--walletlink')
        })
        .forEach(x => localStorage.removeItem(x));
        localStorage.removeItem('walletconnect');
        localStorage.removeItem('WALLETCONNECT_DEEPLINK_CHOICE');

        try {
            this.modal.resetAccount();
            this.modal.resetNetwork();
            this.modal.resetWcConnection();
        } catch (error) {}

        return disconnect();
    }

    /**
     * @returns {String}
     */
    async getChainId() {
        let id = await this.request({method: 'eth_chainId'});
        if (!utils.isNumeric(id)) return parseInt(id, 16);
        return id;
    }

    /**
     * @returns {String}
     */
    async getChainHexId() {
        let id = await this.request({method: 'eth_chainId'});
        if (id == '0x01') return '0x1';
        if (utils.isNumeric(id)) return '0x' + id.toString(16);
        return id;
    }

    /**
     * @returns {Boolean}
     */
    async isConnected() {
        return getAccount().isConnected;
    }

    async connect() {
        return new Promise(async (resolve, reject) => {
            try {
                let account = getAccount();
                if (!account.isConnected) {
                    this.modal.open();
                } else {
                    return resolve(this.connectedAccount = account.address);
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
                            if (this.connectedNetwork && this.connectedNetwork.id != selectedNetworkId) {
                                this.switchNetwork(this.connectedNetwork.id)
                                .then(() => {
                                    resolve(this.connectedAccount = account.address);
                                })
                                .catch((error) => {
                                    utils.rejectMessage(error, reject);
                                });
                            } else {
                                this.setConnectedNetwork(selectedNetworkId);
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
     * @param {Integer} networkId 
     * @returns 
     */
    switchNetwork(networkId) {
        return switchNetwork({
            chainId: networkId
        });
    }

    /**
     * @param {Integer} networkId
     * @returns {void}
     */
    setConnectedNetwork(networkId) {
        this.connectedNetwork = this.networks.find((network) => {
            return network.id == networkId;
        });
    }

    /**
     * @param {String} message 
     * @returns {Promise}
     */
    personalSign(message) {
        return new Promise((resolve, reject) => {
            this.request({
                method: 'personal_sign',
                params: [message, this.connectedAccount],
                from: this.connectedAccount
            })
            .then(signature => {
                resolve(signature);
            })
            .catch(error => {
                utils.rejectMessage(error, reject);
            });
        })
    }
    

    /**
     * @param {Array} params 
     * @returns {Promise}
     */
    sendTransaction(params) {
        return new Promise(async (resolve, reject) => {
            this.request({
                method: 'eth_sendTransaction',
                params,
            })
            .then((transactionId) => {
                resolve(transactionId);
            })
            .catch((error) => {
                utils.rejectMessage(error, reject);
            });
        });
    }

    /**
     * @param {Ocject} params 
     * @returns 
     */
    getEstimateGas(params) {
        return new Promise(async (resolve, reject) => {
            this.request({
                method: 'eth_estimateGas',
                params: [params],
            })
            .then((gas) => {
                resolve(gas);
            })
            .catch((error) => {
                utils.rejectMessage(error, reject);
            });
        });
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
                const { selectedNetworkId } = this.modal.getState();
                if (this.connectedNetwork.id != selectedNetworkId) {
                    return reject('not-accepted-chain');
                }

                const decimals = this.connectedNetwork.nativeCurrency.decimals;
                const balance = await this.request({
                    method: 'eth_getBalance',
                    params: [this.connectedAccount, 'latest']
                });

                if (parseFloat(amount) > utils.toDec(balance, decimals)) {
                    return reject('insufficient-balance');
                }

                if (parseFloat(amount) < 0) {
                    return reject('transfer-amount-error');
                }
                
                const value = utils.toHex(
                    amount, 
                    decimals
                );
    
                const gas = await this.getEstimateGas({
                    from: this.connectedAccount,
                    to,
                    value,
                    data: "0x",
                });

                this.sendTransaction([{
                    from: this.connectedAccount,
                    to,
                    value,
                    gas,
                    data: "0x",
                }])
                .then((transactionId) => {
                    resolve(transactionId);
                })
                .catch((error) => {
                    utils.rejectMessage(error, reject);
                });
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
     * @param  {Array} args 
     * @returns {any}
     */
    async readContract(address, functionName, abi, args) {
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
                const { selectedNetworkId } = this.modal.getState();
                if (this.connectedNetwork.id != selectedNetworkId) {
                    return reject('not-accepted-chain');
                }

                const token = await fetchToken({
                    address: tokenAddress,
                });

                const balance = await this.readContract(
                    tokenAddress,
                    'balanceOf',
                    [{
                        "constant": true,
                        "inputs": [{"name":"_owner","type":"address"}],
                        "name":"balanceOf",
                        "outputs": [{"name":"balance","type":"uint256"}],
                        "payable": false,
                        "stateMutability": "view",
                        "type": "function"
                    
                    }],
                    [
                        this.connectedAccount
                    ]
                );

                if (parseFloat(amount) > utils.toDec(balance, token.decimals)) {
                    return reject('insufficient-balance');
                }

                if (parseFloat(amount) < 0) {
                    return reject('transfer-amount-error');
                }

                const value = utils.toHex(
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

    /**
     * @param {String} to
     * @param {Integer} amount
     * @param {String|null} tokenAddress
     * @return {Transaction|Object}
     * @throws {Error}
     */
    transfer(to, amount, tokenAddress = null) {
        if (tokenAddress) {
            return this.tokenTransfer(to, amount, tokenAddress);
        } else {
            return this.coinTransfer(to, amount);
        }
    }
}

module.exports = Wallet;