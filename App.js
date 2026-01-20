/**
* ============================================================================
* HACASH PAY APP - COMPLETE SINGLE FILE VERSION
* ============================================================================
* 
* Mobile app for instant Hacash cryptocurrency payments
* Features: Layer 2 Channel Chain, 2% deflationary burn, USDT conversion
* 
* SETUP INSTRUCTIONS:
* 1. Create new Expo project: npx create-expo-app hacash-pay-app
* 2. Replace App.js with this file
* 3. Install dependencies (see package.json below)
* 4. Run: expo start
* 
* WalletConnect Project ID: 261a450f4fed1eeeb62f22a0b3cb90c2 (configured)
* ============================================================================
*/

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  RefreshControl
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { BarCodeScanner } from 'expo-barcode-scanner';
import axios from 'axios';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const HACASH_CONFIG = {
  // Network configuration
  MAINNET_RPC: 'https://rpc.hacash.org',
  TESTNET_RPC: 'https://testnet-rpc.hacash.org',
  IS_TESTNET: true, // Set to false for production
  
  // Burn configuration (CRITICAL - deflationary mechanism)
  BURN_ADDRESS: '1BurnHacashSupplyXXXXXXXXXXXXXXYv5wsH',
  BURN_PERCENTAGE: 0.02, // 2% of every payment
  
  // Channel Chain (Layer 2)
  MIN_CHANNEL_BALANCE: 1, // Minimum 1 HAC to open channel
  CHANNEL_CLOSE_FEE: 0.0001, // Settlement fee in HAC
  
  // WalletConnect
  WALLETCONNECT_PROJECT_ID: '261a450f4fed1eeeb62f22a0b3cb90c2',
  
  // Exchange APIs (for HAC → USDT conversion)
  EXCHANGES: {
    COINEX: {
      name: 'CoinEx',
      api: 'https://api.coinex.com/v2',
      pair: 'HACUSDT',
      volumeShare: 0.45,
      requiresKYC: true,
      note: 'Highest liquidity, requires API key + KYC for withdrawals'
    },
    NONKYC: {
      name: 'Nonkyc.io',
      api: 'https://api.nonkyc.io/api/v2',
      pair: 'hac_usdt',
      volumeShare: 0.40,
      requiresKYC: false,
      note: 'Privacy-friendly, no KYC, slightly lower liquidity'
    }
  },
  
  // Price feed APIs
  PRICE_SOURCES: {
    COINGECKO: 'https://api.coingecko.com/api/v3/simple/price?ids=hacash&vs_currencies=usdt',
    COINMARKETCAP: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
    COINEX_TICKER: 'https://api.coinex.com/v2/spot/ticker?market=HACUSDT',
    NONKYC_TICKER: 'https://api.nonkyc.io/api/v2/peatio/public/markets/hacusdt/tickers'
  }
};

const COLORS = {
  primary: '#FF6B35',
  secondary: '#004E89',
  success: '#06D6A0',
  error: '#EF476F',
  warning: '#FFC43D',
  background: '#0A0E27',
  card: '#1A1F3A',
  text: '#FFFFFF',
  textSecondary: '#B0B8D4'
};

const BURN_INFO = {
  title: 'Deflationary Mechanism',
  description: '2% of every payment is permanently burned, reducing HAC total supply. This creates scarcity and potential long-term value appreciation.',
  burnAddress: '1BurnHacashSupplyXXXXXXXXXXXXXXYv5wsH',
  note: 'Burned coins are provably unspendable and removed from circulation forever.'
};

// ============================================================================
// PRICE SERVICE
// ============================================================================

class PriceService {
  constructor() {
    this.cache = {
      price: null,
      timestamp: null,
      source: null
    };
    this.CACHE_DURATION = 15000; // 15 seconds
    this.pollingInterval = null;
  }

  async getHacPrice() {
    if (this.cache.price && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
      return this.cache.price;
    }

    try {
      const coinexPrice = await this.fetchCoinExPrice();
      if (coinexPrice) {
        this.updateCache(coinexPrice, 'CoinEx');
        return coinexPrice;
      }

      const nonkycPrice = await this.fetchNonkycPrice();
      if (nonkycPrice) {
        this.updateCache(nonkycPrice, 'Nonkyc.io');
        return nonkycPrice;
      }

      const geckoPrice = await this.fetchCoinGeckoPrice();
      if (geckoPrice) {
        this.updateCache(geckoPrice, 'CoinGecko');
        return geckoPrice;
      }

      throw new Error('All price sources failed');
    } catch (error) {
      console.error('Price fetch error:', error);
      if (this.cache.price) return this.cache.price;
      throw error;
    }
  }

  async fetchCoinExPrice() {
    try {
      const response = await axios.get(HACASH_CONFIG.PRICE_SOURCES.COINEX_TICKER, { timeout: 3000 });
      const ticker = response.data?.data?.[0];
      if (ticker?.last) return parseFloat(ticker.last);
      return null;
    } catch (error) {
      console.warn('CoinEx price fetch failed:', error.message);
      return null;
    }
  }

  async fetchNonkycPrice() {
    try {
      const response = await axios.get(HACASH_CONFIG.PRICE_SOURCES.NONKYC_TICKER, { timeout: 3000 });
      const ticker = response.data?.ticker;
      if (ticker?.last) return parseFloat(ticker.last);
      return null;
    } catch (error) {
      console.warn('Nonkyc.io price fetch failed:', error.message);
      return null;
    }
  }

  async fetchCoinGeckoPrice() {
    try {
      const response = await axios.get(HACASH_CONFIG.PRICE_SOURCES.COINGECKO, { timeout: 3000 });
      return response.data?.hacash?.usdt || null;
    } catch (error) {
      console.warn('CoinGecko price fetch failed:', error.message);
      return null;
    }
  }

  updateCache(price, source) {
    this.cache = { price, timestamp: Date.now(), source };
  }

  startPolling(callback, interval = 15000) {
    this.stopPolling();
    const poll = async () => {
      try {
        const price = await this.getHacPrice();
        callback(price, this.cache.source);
      } catch (error) {
        console.error('Polling error:', error);
      }
    };
    poll();
    this.pollingInterval = setInterval(poll, interval);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  calculatePayment(usdtAmount, hacPrice) {
    const burnPercentage = HACASH_CONFIG.BURN_PERCENTAGE;
    const baseHac = usdtAmount / hacPrice;
    const totalHac = baseHac / (1 - burnPercentage);
    const burnAmount = totalHac * burnPercentage;
    const merchantAmount = totalHac - burnAmount;
    const merchantUsdt = merchantAmount * hacPrice;
    
    return {
      totalHac: totalHac.toFixed(8),
      burnAmount: burnAmount.toFixed(8),
      merchantHac: merchantAmount.toFixed(8),
      merchantUsdt: merchantUsdt.toFixed(2),
      effectiveRate: hacPrice,
      burnPercentage: (burnPercentage * 100).toFixed(1)
    };
  }
}

const priceService = new PriceService();

// ============================================================================
// WALLET SERVICE (Mock - Replace with WalletConnect in production)
// ============================================================================

class WalletService {
  constructor() {
    this.account = null;
    this.chainId = null;
  }

  async initialize() {
    // In production: Initialize WalletConnect provider
    console.log('WalletService initialized');
  }

  async connect() {
    // Mock connection - Replace with real WalletConnect
    this.account = '1MzNY1oA3kfgYi75zGtu7xXfWYxxx3wxxN';
    this.chainId = 'hacash-testnet';
    
    Alert.alert(
      'Wallet Connected (Demo)',
      'In production, this will use WalletConnect to connect your Hacash wallet.\n\nDemo Address:\n' + this.account
    );
    
    return { address: this.account, chainId: this.chainId };
  }

  async disconnect() {
    this.account = null;
    this.chainId = null;
  }

  async signTransaction(txHex) {
    return 'MOCK_SIGNATURE_' + Date.now();
  }

  async getBalance() {
    // Mock balance - Replace with real Hacash node query
    return {
      l1: 50.5,
      l2: 25.25,
      total: 75.75,
      channels: []
    };
  }

  isConnected() {
    return !!this.account;
  }
}

const walletService = new WalletService();

// ============================================================================
// CHANNEL SERVICE
// ============================================================================

class ChannelService {
  constructor() {
    this.activeChannels = [];
    this.rpcUrl = HACASH_CONFIG.IS_TESTNET 
      ? HACASH_CONFIG.TESTNET_RPC 
      : HACASH_CONFIG.MAINNET_RPC;
  }

  async openChannel(merchantAddress, initialBalance) {
    const channelId = this.generateChannelId();
    
    const channel = {
      id: channelId,
      leftAddress: walletService.account,
      rightAddress: merchantAddress,
      leftBalance: initialBalance,
      rightBalance: 0,
      nonce: 0,
      status: 'open',
      openedAt: Date.now()
    };

    this.activeChannels.push(channel);
    return channel;
  }

  async makePayment(channelId, amount) {
    const channel = this.activeChannels.find(c => c.id === channelId);
    if (!channel) throw new Error('Channel not found');
    if (channel.leftBalance < amount) throw new Error('Insufficient channel balance');

    const newLeftBalance = channel.leftBalance - amount;
    const newRightBalance = channel.rightBalance + amount;
    const newNonce = channel.nonce + 1;

    channel.leftBalance = newLeftBalance;
    channel.rightBalance = newRightBalance;
    channel.nonce = newNonce;
    channel.lastUpdate = Date.now();

    return {
      success: true,
      channelId,
      amount,
      newBalance: newLeftBalance,
      instant: true
    };
  }

  async closeChannel(channelId) {
    const channel = this.activeChannels.find(c => c.id === channelId);
    if (!channel) throw new Error('Channel not found');

    const merchantAmount = channel.rightBalance;
    const burnAmount = merchantAmount * HACASH_CONFIG.BURN_PERCENTAGE;
    const finalMerchantAmount = merchantAmount - burnAmount;

    this.activeChannels = this.activeChannels.filter(c => c.id !== channelId);

    return {
      success: true,
      txHash: 'MOCK_TX_' + Date.now(),
      burnAmount,
      merchantAmount: finalMerchantAmount,
      burned: burnAmount,
      settled: finalMerchantAmount
    };
  }

  generateChannelId() {
    return '0x' + Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

const channelService = new ChannelService();

// ============================================================================
// HOME SCREEN
// ============================================================================

function HomeScreen({ navigation }) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState({ l1: 0, l2: 0, total: 0 });
  const [price, setPrice] = useState(0);
  const [priceSource, setPriceSource] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(() => {
      if (connected) updateBalanceAndPrice();
    }, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  const checkConnection = async () => {
    const isConnected = walletService.isConnected();
    setConnected(isConnected);
    if (isConnected) {
      setAddress(walletService.account);
      updateBalanceAndPrice();
    }
  };

  const updateBalanceAndPrice = async () => {
    try {
      const bal = await walletService.getBalance();
      setBalance(bal);
      const currentPrice = await priceService.getHacPrice();
      setPrice(currentPrice);
      setPriceSource(priceService.cache.source);
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  const handleConnect = async () => {
    try {
      const wallet = await walletService.connect();
      setAddress(wallet.address);
      setConnected(true);
      await updateBalanceAndPrice();
    } catch (error) {
      Alert.alert('Error', 'Connection failed: ' + error.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await updateBalanceAndPrice();
    setRefreshing(false);
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  if (!connected) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeContainer}>
          <Text style={styles.title}>Welcome to Hacash Pay</Text>
          <Text style={styles.subtitle}>Instant L2 payments with 2% deflationary burn</Text>
          
          <View style={styles.featureBox}>
            <Text style={styles.featureTitle}>✨ Key Features</Text>
            <Text style={styles.featureText}>• Instant off-chain payments via L2 channels</Text>
            <Text style={styles.featureText}>• 2% burn on every tx (reduces HAC supply)</Text>
            <Text style={styles.featureText}>• Auto-convert to USDT for merchants</Text>
            <Text style={styles.featureText}>• Low fees, high speed</Text>
          </View>

          <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
            <Text style={styles.connectButtonText}>Connect Wallet</Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Supports Hacash Channel Wallet and compatible wallets
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.addressLabel}>Connected</Text>
        <Text style={styles.address}>{formatAddress(address)}</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceAmount}>{balance.total.toFixed(4)} HAC</Text>
        <Text style={styles.balanceUsd}>≈ ${(balance.total * price).toFixed(2)} USDT</Text>
        
        <View style={styles.balanceBreakdown}>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>L1 (On-chain)</Text>
            <Text style={styles.breakdownValue}>{balance.l1.toFixed(4)} HAC</Text>
          </View>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>L2 (Channels)</Text>
            <Text style={styles.breakdownValue}>{balance.l2.toFixed(4)} HAC</Text>
          </View>
        </View>
      </View>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Current Rate</Text>
        <Text style={styles.priceValue}>1 HAC = ${price.toFixed(4)} USDT</Text>
        <Text style={styles.priceSource}>Source: {priceSource}</Text>
      </View>

      <View style={styles.burnInfoCard}>
        <Text style={styles.burnTitle}>🔥 {BURN_INFO.title}</Text>
        <Text style={styles.burnDescription}>{BURN_INFO.description}</Text>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Payment')}
        >
          <Text style={styles.primaryButtonText}>Make Payment</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Channels')}
        >
          <Text style={styles.secondaryButtonText}>Manage Channels</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.secondaryButtonText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// PAYMENT SCREEN
// ============================================================================

function PaymentScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [usdtAmount, setUsdtAmount] = useState('');
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [price, setPrice] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [merchantAddress, setMerchantAddress] = useState('');
  const [selectedChannel, setSelectedChannel] = useState(null);

  useEffect(() => {
    requestCameraPermission();
    loadPrice();
    loadChannels();
  }, []);

  const requestCameraPermission = async () => {
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const loadPrice = async () => {
    try {
      const currentPrice = await priceService.getHacPrice();
      setPrice(currentPrice);
    } catch (error) {
      Alert.alert('Error', 'Failed to load price');
    }
  };

  const loadChannels = async () => {
    const channels = channelService.activeChannels;
    if (channels.length > 0) {
      setSelectedChannel(channels[0]);
    }
  };

  const handleBarCodeScanned = ({ type, data }) => {
    setScanning(false);
    try {
      const url = new URL(data);
      const address = url.searchParams.get('address');
      const amount = url.searchParams.get('amount');
      if (address) setMerchantAddress(address);
      if (amount) setUsdtAmount(amount);
    } catch (error) {
      Alert.alert('Invalid QR Code', 'Please scan a valid Hacash payment QR code');
    }
  };

  const calculatePayment = () => {
    if (!usdtAmount || !price) return;
    const amount = parseFloat(usdtAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    const details = priceService.calculatePayment(amount, price);
    setPaymentDetails(details);
  };

  const executePayment = async () => {
    if (!paymentDetails || !merchantAddress) {
      Alert.alert('Error', 'Missing payment details or merchant address');
      return;
    }

    if (!selectedChannel) {
      Alert.alert('Error', 'No active payment channel. Please open a channel first.');
      navigation.navigate('Channels');
      return;
    }

    setProcessing(true);

    try {
      const payment = await channelService.makePayment(
        selectedChannel.id,
        parseFloat(paymentDetails.totalHac)
      );

      Alert.alert(
        'Payment Sent! ⚡',
        `Instant L2 payment of ${paymentDetails.totalHac} HAC completed.\n\n🔥 Burned: ${paymentDetails.burnAmount} HAC (2%)\n💰 To Merchant: ${paymentDetails.merchantHac} HAC\n📊 USDT Value: $${paymentDetails.merchantUsdt}\n\nThe payment was instant via Layer 2!\nChannel settlement will occur periodically.`,
        [
          { text: 'Done', onPress: () => navigation.goBack() }
        ]
      );
    } catch (error) {
      Alert.alert('Payment Failed', error.message);
    } finally {
      setProcessing(false);
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><Text style={styles.text}>Requesting camera permission...</Text></View>;
  }

  if (hasPermission === false) {
    return <View style={styles.container}><Text style={styles.text}>Camera permission denied</Text></View>;
  }

  if (scanning) {
    return (
      <View style={styles.container}>
        <BarCodeScanner
          onBarCodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerText}>Scan Merchant QR Code</Text>
          <TouchableOpacity 
            style={styles.cancelScanButton}
            onPress={() => setScanning(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Merchant Details</Text>
        
        <TouchableOpacity 
          style={styles.scanButton}
          onPress={() => setScanning(true)}
        >
          <Text style={styles.scanButtonText}>📷 Scan QR Code</Text>
        </TouchableOpacity>

        <Text style={styles.orText}>or enter manually</Text>

        <TextInput
          style={styles.input}
          placeholder="Merchant Address"
          placeholderTextColor={COLORS.textSecondary}
          value={merchantAddress}
          onChangeText={setMerchantAddress}
        />

        <Text style={styles.sectionTitle}>Payment Amount</Text>

        <View style={styles.amountContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={COLORS.textSecondary}
            value={usdtAmount}
            onChangeText={setUsdtAmount}
            keyboardType="decimal-pad"
          />
          <Text style={styles.currencyLabel}>USDT</Text>
        </View>

        <TouchableOpacity 
          style={styles.calculateButton}
          onPress={calculatePayment}
        >
          <Text style={styles.calculateButtonText}>Calculate Payment</Text>
        </TouchableOpacity>

        {paymentDetails && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Payment Breakdown</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total HAC Required:</Text>
              <Text style={styles.detailValue}>{paymentDetails.totalHac} HAC</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>🔥 Burn (2%):</Text>
              <Text style={[styles.detailValue, {color: COLORS.error}]}>
                {paymentDetails.burnAmount} HAC
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>To Merchant (98%):</Text>
              <Text style={[styles.detailValue, {color: COLORS.success}]}>
                {paymentDetails.merchantHac} HAC
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Merchant Receives:</Text>
              <Text style={styles.detailValue}>${paymentDetails.merchantUsdt} USDT</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Exchange Rate:</Text>
              <Text style={styles.detailValue}>${paymentDetails.effectiveRate}/HAC</Text>
            </View>

            <View style={styles.burnNotice}>
              <Text style={styles.burnNoticeText}>
                ⚠️ {paymentDetails.burnAmount} HAC will be permanently burned, 
                reducing total supply and supporting long-term value.
              </Text>
            </View>

            <TouchableOpacity 
              style={[styles.payButton, processing && styles.payButtonDisabled]}
              onPress={executePayment}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={styles.payButtonText}>
                  ⚡ Pay {paymentDetails.totalHac} HAC (Instant L2)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {selectedChannel && (
          <Text style={styles.channelInfo}>
            Using L2 Channel: {selectedChannel.id.substring(0, 12)}...
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// CHANNELS SCREEN
// ============================================================================

function ChannelsScreen({ navigation }) {
  const [channels, setChannels] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChannelAddress, setNewChannelAddress] = useState('');
  const [newChannelAmount, setNewChannelAmount] = useState('');

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = () => {
    setChannels(channelService.activeChannels);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    loadChannels();
    setRefreshing(false);
  };

  const handleCreateChannel = async () => {
    const amount = parseFloat(newChannelAmount);
    
    if (!newChannelAddress || isNaN(amount) || amount < HACASH_CONFIG.MIN_CHANNEL_BALANCE) {
      Alert.alert('Error', `Please enter valid details. Minimum: ${HACASH_CONFIG.MIN_CHANNEL_BALANCE} HAC`);
      return;
    }

    try {
      const channel = await channelService.openChannel(newChannelAddress, amount);
      
      Alert.alert(
        'Channel Opening',
        `Channel created! It will be ready for payments once confirmed on L1.\n\nChannel ID: ${channel.id.substring(0, 16)}...\nInitial Balance: ${amount} HAC\n\nYou can now make instant payments through this channel!`,
        [{ text: 'OK', onPress: () => {
          setShowCreateForm(false);
          setNewChannelAddress('');
          setNewChannelAmount('');
          loadChannels();
        }}]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to create channel: ' + error.message);
    }
  };

  const handleCloseChannel = (channel) => {
    Alert.alert(
      'Close Channel?',
      `This will settle the channel on L1 with the following:\n\nYour Balance: ${channel.leftBalance} HAC\nMerchant Balance: ${channel.rightBalance} HAC\n\nBurn (2%): ${(channel.rightBalance * 0.02).toFixed(8)} HAC\nTo Merchant: ${(channel.rightBalance * 0.98).toFixed(8)} HAC\n\nSettlement fee: ${HACASH_CONFIG.CHANNEL_CLOSE_FEE} HAC\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Close Channel', 
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await channelService.closeChannel(channel.id);
              
              Alert.alert(
                'Channel Closed',
                `Settlement transaction broadcast!\n\n🔥 Burned: ${result.burnAmount.toFixed(8)} HAC\n💰 Settled: ${result.merchantAmount.toFixed(8)} HAC\n\nTX: ${result.txHash}`,
                [{ text: 'OK', onPress: loadChannels }]
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to close channel: ' + error.message);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Payment Channels (L2)</Text>
          <Text style={styles.headerSubtitle}>Instant off-chain payments with minimal fees</Text>
        </View>

        {channels.length === 0 && !showCreateForm && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No active channels</Text>
            <Text style={styles.emptySubtext}>Create a channel to enable instant L2 payments</Text>
          </View>
        )}

        {channels.map((channel) => (
          <View key={channel.id} style={styles.channelCard}>
            <View style={styles.channelHeader}>
              <Text style={styles.channelId}>{channel.id.substring(0, 12)}...</Text>
              <View style={[styles.statusBadge, channel.status === 'open' ? styles.statusOpen : styles.statusPending]}>
                <Text style={styles.statusText}>{channel.status}</Text>
              </View>
            </View>

            <View style={styles.channelBalances}>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Your Balance</Text>
                <Text style={styles.balanceValue}>{channel.leftBalance.toFixed(4)} HAC</Text>
              </View>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Merchant Balance</Text>
                <Text style={styles.balanceValue}>{channel.rightBalance.toFixed(4)} HAC</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => handleCloseChannel(channel)}
            >
              <Text style={styles.closeButtonText}>Settle & Close Channel</Text>
            </TouchableOpacity>
          </View>
        ))}

        {!showCreateForm ? (
          <TouchableOpacity 
            style={styles.createButton}
            onPress={() => setShowCreateForm(true)}
          >
            <Text style={styles.createButtonText}>+ Open New Channel</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.createForm}>
            <Text style={styles.formTitle}>Create Payment Channel</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Merchant/Service Node Address"
              placeholderTextColor={COLORS.textSecondary}
              value={newChannelAddress}
              onChangeText={setNewChannelAddress}
            />

            <TextInput
              style={styles.input}
              placeholder={`Initial Balance (min: ${HACASH_CONFIG.MIN_CHANNEL_BALANCE} HAC)`}
              placeholderTextColor={COLORS.textSecondary}
              value={newChannelAmount}
              onChangeText={setNewChannelAmount}
              keyboardType="decimal-pad"
            />

            <View style={styles.formButtons}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setShowCreateForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.submitButton}
                onPress={handleCreateChannel}
              >
                <Text style={styles.submitButtonText}>Create Channel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// SETTINGS SCREEN
// ============================================================================

function SettingsScreen({ navigation }) {
  const [isTestnet, setIsTestnet] = useState(HACASH_CONFIG.IS_TESTNET);
  const [burnPercentage] = useState(HACASH_CONFIG.BURN_PERCENTAGE);

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Wallet?',
      'You will need to reconnect to make payments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await walletService.disconnect();
            Alert.alert('Disconnected', 'Wallet disconnected successfully');
            navigation.navigate('Home');
          }
        }
      ]
    );
  };

  const toggleTestnet = (value) => {
    setIsTestnet(value);
    // Σε πραγματική εφαρμογή: εδώ θα αλλάζαμε το rpcUrl του channelService κλπ.
    Alert.alert('Network Changed', `Now using: ${value ? 'Testnet' : 'Mainnet'}`);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wallet</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Connected Address</Text>
          <Text style={styles.settingValue}>
            {walletService.account 
              ? `${walletService.account.substring(0, 10)}...${walletService.account.substring(walletService.account.length - 8)}`
              : 'Not connected'
            }
          </Text>
        </View>

        <TouchableOpacity style={styles.dangerButton} onPress={handleDisconnect}>
          <Text style={styles.dangerButtonText}>Disconnect Wallet</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Testnet Mode</Text>
          <Switch
            value={isTestnet}
            onValueChange={toggleTestnet}
            trackColor={{ false: COLORS.background, true: COLORS.primary }}
            thumbColor={isTestnet ? COLORS.text : COLORS.textSecondary}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Burn Settings</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Burn Percentage</Text>
          <Text style={styles.settingValue}>{(burnPercentage * 100).toFixed(1)}%</Text>
        </View>

        <View style={styles.burnNotice}>
          <Text style={styles.burnNoticeText}>
            ⚠️ {BURN_INFO.description}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔥 Every payment burns 2% HAC{'\n'}
          Reducing supply since 2026
        </Text>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const Stack = createStackNavigator();

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeApp();
    return () => {
      priceService.stopPolling();
    };
  }, []);

  const initializeApp = async () => {
    try {
      await walletService.initialize();
      priceService.startPolling((price, source) => {
        console.log(`Price updated: ${price} USDT from ${source}`);
      });
      setIsInitialized(true);
    } catch (error) {
      console.error('App initialization failed:', error);
      Alert.alert('Error', 'Failed to initialize app. Please restart.');
    }
  };

  if (!isInitialized) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.splashContainer}>
          <Text style={styles.splashTitle}>HACASH PAY</Text>
          <Text style={styles.splashSubtitle}>Instant L2 Payments</Text>
          <Text style={styles.splashLoading}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: 'bold' }
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Hacash Pay' }} />
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Make Payment' }} />
        <Stack.Screen name="Channels" component={ChannelsScreen} options={{ title: 'L2 Channels' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background
  },
  splashTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 10
  },
  splashSubtitle: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginBottom: 40
  },
  splashLoading: {
    fontSize: 14,
    color: COLORS.text
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 40
  },
  featureBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    width: '100%'
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 15
  },
  featureText: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8
  },
  connectButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 12,
    marginBottom: 20
  },
  connectButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold'
  },
  disclaimer: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center'
  },
  header: {
    backgroundColor: COLORS.card,
    padding: 15,
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary
  },
  addressLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 5
  },
  address: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: 'monospace'
  },
  balanceCard: {
    backgroundColor: COLORS.card,
    margin: 15,
    padding: 20,
    borderRadius: 12
  },
  balanceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 5
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5
  },
  balanceUsd: {
    fontSize: 18,
    color: COLORS.success,
    marginBottom: 20
  },
  balanceBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.background,
    paddingTop: 15
  },
  breakdownItem: {
    flex: 1
  },
  breakdownLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 5
  },
  breakdownValue: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600'
  },
  priceCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center'
  },
  priceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 5
  },
  priceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.warning,
    marginBottom: 5
  },
  priceSource: {
    fontSize: 11,
    color: COLORS.textSecondary
  },
  burnInfoCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary
  },
  burnTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 10
  },
  burnDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20
  },
  actionsContainer: {
    padding: 15,
    paddingBottom: 30
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12
  },
  primaryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  secondaryButton: {
    backgroundColor: COLORS.card,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 16
  },
  content: {
    padding: 20
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
    marginTop: 10
  },
  scanButton: {
    backgroundColor: COLORS.secondary,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  scanButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600'
  },
  orText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginVertical: 10
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 15,
    borderRadius: 12,
    fontSize: 14,
    marginBottom: 20,
    fontFamily: 'monospace'
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 20
  },
  currencySymbol: {
    fontSize: 24,
    color: COLORS.success,
    marginRight: 10
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text
  },
  currencyLabel: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginLeft: 10
  },
  calculateButton: {
    backgroundColor: COLORS.warning,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20
  },
  calculateButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: 'bold'
  },
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 15
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text
  },
  burnNotice: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 15
  },
  burnNoticeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18
  },
  payButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center'
  },
  payButtonDisabled: {
    opacity: 0.5
  },
  payButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  channelInfo: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'monospace'
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 50
  },
  scannerText: {
    fontSize: 18,
    color: COLORS.text,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20
  },
  cancelScanButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  text: {
    color: COLORS.text,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20
  },
  emptyState: {
    padding: 40,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 10
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center'
  },
  channelCard: {
    backgroundColor: COLORS.card,
    margin: 15,
    padding: 20,
    borderRadius: 12
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15
  },
  channelId: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: COLORS.text,
    fontWeight: 'bold'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusOpen: {
    backgroundColor: COLORS.success
  },
  statusPending: {
    backgroundColor: COLORS.warning
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.background
  },
  channelBalances: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.background
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center'
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text
  },
  closeButton: {
    backgroundColor: COLORS.error,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  closeButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600'
  },
  createButton: {
    backgroundColor: COLORS.primary,
    margin: 15,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center'
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  createForm: {
    backgroundColor: COLORS.card,
    margin: 15,
    padding: 20,
    borderRadius: 12
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20
  },
  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center'
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center'
  },
  submitButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold'
  },
  section: {
    backgroundColor: COLORS.card,
    margin: 15,
    padding: 20,
    borderRadius: 12
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background
  },
  settingLabel: {
    fontSize: 14,
    color: COLORS.text
  },
  settingValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
    maxWidth: '60%',
    textAlign: 'right'
  },
  dangerButton: {
    backgroundColor: COLORS.error,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15
  },
  dangerButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold'
  },
  footer: {
    padding: 30,
    alignItems: 'center'
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20
  }
});

/**
* ============================================================================
* PACKAGE.JSON DEPENDENCIES
* ============================================================================
* 
* {
* "dependencies": {
* "expo": "~50.0.0",
* "react": "18.2.0",
* "react-native": "0.73.0",
* "@react-navigation/native": "^6.1.9",
* "@react-navigation/stack": "^6.3.20",
* "axios": "^1.6.2",
* "expo-barcode-scanner": "~12.9.0",
* "react-native-screens": "~3.29.0",
* "react-native-safe-area-context": "~4.8.2"
* }
* }
* 
* INSTALL COMMAND:
* npm install @react-navigation/native @react-navigation/stack axios expo-barcode-scanner react-native-screens react-native-safe-area-context
* 
* ============================================================================
*/