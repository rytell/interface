# Rytell Interface

An open source interface for Rytell -- a community-driven decentralized exchange for Avalanche and Ethereum assets with fast settlement, low transaction fees, and a democratic distribution -- powered by Avalanche.

- Website: [rytell.exchange](https://rytell.exchange/)
- Interface: [app.rytell.exchange](https://app.rytell.exchange)
- Telegram: [Rytell](https://t.me/rytelldex)
- Discord: [Rytell](https://discord.com/invite/PARrDYYbfw)
- Twitter: [@rytelldex](https://twitter.com/rytelldex)

## Accessing the Rytell Interface

Visit [app.rytell.exchange](https://app.rytell.exchange).

## Development

### Install Dependencies

```bash
yarn
```

### Run

```bash
yarn start
```

### Configuring the environment (optional)

To have the interface default to a different network when a wallet is not connected:

1. Make a copy of `.env` named `.env.local`
2. Change `REACT_APP_NETWORK_ID` to `"{YOUR_NETWORK_ID}"`
3. Change `REACT_APP_NETWORK_URL` to your JSON-RPC provider

Note that the interface only works on testnets where both
[Rytell](https://github.com/rytelldex/exchange-contracts) and
[multicall](https://github.com/makerdao/multicall) are deployed.
The interface will not work on other networks.

## Attribution

This code was adapted from this Uniswap repo: [uniswap-interface](https://github.com/Uniswap/uniswap-interface).
