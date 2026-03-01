<template>
  <section class="card wallet-panel">
    <div class="row">
      <h4>Wallet</h4>
      <button class="btn" :disabled="wallet.loading" @click="wallet.refresh">Refresh</button>
    </div>
    <p class="muted">Balance: {{ wallet.balance.toFixed(2) }} TOK</p>
    <p v-if="wallet.error" class="error">{{ wallet.error }}</p>
    <p v-if="wallet.success" class="ok">{{ wallet.success }}</p>

    <div class="wallet-grid">
      <form class="card" @submit.prevent="onLink">
        <p class="title">Link Wallet</p>
        <input v-model="linkChain" placeholder="Chain (BTC/ETH/SOL)" required />
        <input v-model="linkAddress" placeholder="Wallet address" required />
        <input v-model="linkLabel" placeholder="Label (optional)" />
        <button class="btn" :disabled="wallet.saving" type="submit">Link</button>
      </form>

      <form class="card" @submit.prevent="onDeposit">
        <p class="title">Add Money (Verify Deposit)</p>
        <input v-model="depChain" placeholder="Chain" required />
        <input v-model="depAsset" placeholder="Asset" required />
        <input v-model="depTxHash" placeholder="Tx Hash" required />
        <input v-model.number="depAmount" min="0.000001" placeholder="Crypto amount" required step="any" type="number" />
        <input v-model.number="depRate" min="0" placeholder="USD rate (optional)" step="any" type="number" />
        <button class="btn" :disabled="wallet.saving" type="submit">Verify Deposit</button>
      </form>

      <form class="card" @submit.prevent="onWithdraw">
        <p class="title">Withdraw</p>
        <input v-model="wdChain" placeholder="Chain" required />
        <input v-model="wdAsset" placeholder="Asset" required />
        <input v-model="wdAddress" placeholder="Destination address" required />
        <input v-model.number="wdTokens" min="0.01" placeholder="Token amount" required step="any" type="number" />
        <input v-model.number="wdRate" min="0" placeholder="USD rate (optional)" step="any" type="number" />
        <button class="btn" :disabled="wallet.saving" type="submit">Request Withdrawal</button>
      </form>
    </div>

    <details>
      <summary>Linked Wallets</summary>
      <ul class="compact-list">
        <li v-for="item in wallet.links" :key="item.id">
          {{ item.chain }} - {{ item.wallet_address }} {{ item.label ? `(${item.label})` : "" }}
        </li>
      </ul>
    </details>

    <details>
      <summary>Recent Transactions</summary>
      <ul class="compact-list">
        <li v-for="tx in wallet.txs.slice(0, 10)" :key="tx.id">
          {{ tx.tx_type }} {{ tx.asset }} {{ tx.token_amount.toFixed(2) }} - {{ tx.status }}
        </li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"

import { useWalletStore } from "../stores/wallet"

const wallet = useWalletStore()

const linkChain = ref("ETH")
const linkAddress = ref("")
const linkLabel = ref("")

const depChain = ref("ETH")
const depAsset = ref("ETH")
const depTxHash = ref("")
const depAmount = ref(0)
const depRate = ref<number | null>(null)

const wdChain = ref("ETH")
const wdAsset = ref("ETH")
const wdAddress = ref("")
const wdTokens = ref(0)
const wdRate = ref<number | null>(null)

async function onLink() {
  await wallet.addWalletLink({
    chain: linkChain.value.trim().toUpperCase(),
    wallet_address: linkAddress.value.trim(),
    label: linkLabel.value.trim() || undefined,
  })
}

async function onDeposit() {
  await wallet.addDeposit({
    chain: depChain.value.trim().toUpperCase(),
    asset: depAsset.value.trim().toUpperCase(),
    tx_hash: depTxHash.value.trim(),
    crypto_amount: depAmount.value,
    usd_rate: depRate.value || undefined,
  })
}

async function onWithdraw() {
  await wallet.withdraw({
    chain: wdChain.value.trim().toUpperCase(),
    asset: wdAsset.value.trim().toUpperCase(),
    destination_address: wdAddress.value.trim(),
    token_amount: wdTokens.value,
    usd_rate: wdRate.value || undefined,
  })
}

onMounted(() => {
  void wallet.refresh()
})
</script>

