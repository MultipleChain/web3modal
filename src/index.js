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
    getPublicClient,
    signMessage,
    sendTransaction, 
    prepareSendTransaction
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
     * @var {Function}
     */
    connectRejectMethod;
    
    /**
     * @var {String}
     */
    connectedAccount;

    constructor(options) {
        let network = options.network;
        let customWallets = options.customWallets || [];
        let metadata = this.metadata = options.metadata;
        let projectId = this.projectId = options.projectId;

        let themeMode = this.themeMode;
        if (options.themeMode) {
            themeMode = this.themeMode = options.themeMode;
        }

        let chains = [];
        
        if (network) {
            let findedNetwork = Object.values(wagmiChains).find((chain) => {
                if (utils.isNumeric(network)) {
                    return chain.id == parseInt(network);
                } else if (typeof network == 'string') {
                    return chain.network == network;
                } else if (typeof network == 'object') {
                    return chain.id == network.id;
                }
            });

            if (!findedNetwork && typeof network == 'object') {
                chains.push(this.wagmiStandart(network));
            } else {
                chains.push(findedNetwork);
            }

            this.connectedNetwork = chains[0];
        } else {
            chains = Object.values(wagmiChains);
        }

        if (chains.length == 0) {
            throw new Error('network-not-found');
        }

        const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

        wagmiConfig.autoConnect = () => {
            return;
        }

        this.modal = createWeb3Modal({ 
            themeMode, 
            wagmiConfig, 
            projectId, 
            chains,
            customWallets,
            themeVariables: {
                '--w3m-z-index': 999999999999,
            }
        });

        let clickedAnyWallet = false;
        this.modal.subscribeEvents(async (event) => {
            if (event.data.event == "SELECT_WALLET") {
                clickedAnyWallet = true;
            }
            if (event.data.event == "MODAL_CLOSE") {
                if (typeof this.connectRejectMethod == 'function') {
                    if (clickedAnyWallet) {
                        clickedAnyWallet = false;
                        if (this.connectedNetwork.id != (await this.getChainId())) {
                            return this.connectRejectMethod('not-accepted-chain');
                        }
                    }
                    this.connectRejectMethod('closed-web3modal');
                }
            }
        });

        this.networks = chains;
    }

    wagmiStandart(network) {
        let defaultRpc = {
            http: [network.rpcUrl],
        }
        if (network.wsUrl) {
            defaultRpc.webSocket = [network.wsUrl]
        }
        return Object.assign(network, {
            network: network.name,
            nativeCurrency: {
                name: network.nativeCurrency.symbol,
                symbol: network.nativeCurrency.symbol,
                decimals: network.nativeCurrency.decimals,
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
        });
    }

    setNetwork(network) {
        if (typeof network == 'object') {
            this.connectedNetwork = this.wagmiStandart(network);
        } else if (utils.isNumeric(network)) {
            this.connectedNetwork = this.networks.find(n => n.id == parseInt(network));
        } else if (typeof network == 'string') {
            this.connectedNetwork = this.networks.find(n => n.network == network);
        }
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
            x.startsWith('@w3m') ||
            x.startsWith('W3M') ||
            x.startsWith('-walletlink')
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
        return (await this.getWalletClient()).getChainId();
    }

    /**
     * @returns {Boolean}
     */
    async isConnected() {
        return getAccount().isConnected;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.connection()
            .then(async (account) => {
                // if networks not equal
                if (this.connectedNetwork.id != (await this.getChainId())) {
                    return reject('not-accepted-chain');
                }
                resolve(account);
            })
            .catch((error) => {
                reject(error);
            });
        });
    }

    async connection() {
        return new Promise(async (resolve, reject) => {
            try {
                this.connectRejectMethod = reject;
                
                let account = getAccount();
                if (!account.isConnected) {
                    this.modal.open();
                } else {
                    return resolve(this.connectedAccount = account.address);
                }

                let switching = false;
                watchAccount(async account => {
                    if (account.isConnected) {
                        try {
                            const { selectedNetworkId } = this.modal.getState();
                            if (this.connectedNetwork && this.connectedNetwork.id != selectedNetworkId) {
                                if (switching) return;
                                switching = true;
                                this.switchNetwork(this.connectedNetwork.id)
                                .then(() => {
                                    resolve(this.connectedAccount = account.address);
                                })
                                .catch(() => {
                                    reject('switch-chain-rejected');
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
        return new Promise(async (resolve, reject) => {
            try {
                resolve(await signMessage({message}));
            } catch (error) {
                utils.rejectMessage(error, reject);
            }
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
    
                try {
                    const { hash } = await sendTransaction((await prepareSendTransaction({
                        to,
                        value,
                        account: this.connectedAccount,
                    })));

                    resolve(hash);
                } catch (error) {
                    utils.rejectMessage(error, reject);
                }
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