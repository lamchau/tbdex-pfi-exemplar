import { TbdexHttpClient, Rfq, Quote, Order, OrderStatus, Close } from '@tbdex/http-client'
import { createOrLoadDid } from './utils.js'
import { PortableDid } from '@web5/dids'

//
// get the PFI did from the command line parameter
//
const pfiDid = process.argv[2]
if (!pfiDid) {
  console.error('Please put in the DID of the PFI as the first parameter')
  process.exit(1)
}


const signedCredential = process.argv[3]
if (!signedCredential) {
  console.error('Please put in the signed credential as the second parameter')
  process.exit(1)
}

//
//  Connect to the PFI and get the list of offerings (offerings are resources - anyone can ask for them)
//
const [ offering ] = await TbdexHttpClient.getOfferings({ pfiDid: pfiDid })
console.log('got offering:', JSON.stringify(offering, null, 2))


//
// Load alice's private key to sign RFQ
//
const alice = await createOrLoadDid('alice.json')

//
// And here we go with tbdex-protocol!
//

// First, Create an RFQ
const rfq = Rfq.create({
  metadata: { from: alice.did, to: pfiDid },
  data: {
    offeringId: offering.id,
    payinAmount: '100.00',
    payinMethod: {
      kind: 'USD_LEDGER',
      paymentDetails: {}
    },
    payoutMethod: {
      kind: 'BANK_FIRSTBANK',
      paymentDetails: {
        accountNumber: '0x1234567890',
        reason: 'I got kids'
      }
    },
    claims: [signedCredential]
  }
})

await rfq.sign(alice)

console.log('sending RFQ:', JSON.stringify(rfq, null, 2))
await TbdexHttpClient.sendMessage({ message: rfq })

//
//
// All interaction with the PFI happens in the context of an exchange.
// This is where for example a quote would show up in result to an RFQ:
const exchanges = await TbdexHttpClient.getExchanges({
  pfiDid: pfiDid,
  did: alice,
  filter: { id: rfq.exchangeId }
})


//
// Now lets get the quote out of the returned exchange
//
const [ exchange ] = exchanges
for (const message of exchange) {
  if (message instanceof Quote) {
    const quote = message as Quote
    console.log('we have received a quote!', JSON.stringify(quote, null, 2))

    // Place an order against that quote:
    const order = Order.create({
      metadata: { from: alice.did, to: pfiDid, exchangeId: quote.exchangeId },
    })
    await order.sign(alice)
    console.log('Sending order: ', JSON.stringify(order, null, 2))
    await TbdexHttpClient.sendMessage({ message: order })

    // poll for order status updates
    await pollForStatus(order, pfiDid, alice)
  }
}

/*
 * This is a very simple polling function that will poll for the status of an order.
 */
async function pollForStatus(order: Order, pfiDid: string, did: PortableDid) {
  let close: Close
  while (!close) {
    const exchanges = await TbdexHttpClient.getExchanges({
      pfiDid: pfiDid,
      did: did,
      filter: { id: order.exchangeId }
    })

    const [ exchange ] = exchanges

    for (const message of exchange) {
      if (message instanceof OrderStatus) {
        console.log('we got a new order status')
        const orderStatus = message as OrderStatus
        console.log('orderStatus', JSON.stringify(orderStatus, null, 2))
      }
      else if(message instanceof Close) {
        console.log('we have a close message')
        close = message as Close
        console.log('close', JSON.stringify(close, null, 2))
        return close
      }
    }
  }
}



