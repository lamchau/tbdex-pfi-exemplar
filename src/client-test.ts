import { TbdexHttpClient, Rfq } from '@tbdex/http-client'
import { VerifiableCredential } from '@web5/credentials'
import { PortableDid } from '@web5/dids'
import { createOrLoadDid } from './example/utils.js'
import { config } from './config.js'

//
//
// Replace this with the DID of the PFI you want to connect to.
// Get this from the console of the server once you launch it.
//

// load server-did (this will be created when you run server did, or you can copy/paste one):
let PFI_DID: PortableDid = config.pfiDid
console.log('PFI DID FROM CLIENT:', PFI_DID.did)


//
//
//  Connect to the PFI and get the list of offerings (offerings are resources - anyone can ask for them)
//
const [ offering ] = await TbdexHttpClient.getOfferings({ pfiDid: PFI_DID.did })
//console.log('offering', JSON.stringify(offering, null, 2))


//
//
// Create a did for the issuer of the SanctionCredential. In the real world this would be an external service.
// But here we will just create one.
// Copy the issuer did into the seed-offerings.ts file and run:
//    npm run seed-offerings to seed the PFI with the issuer DID.
//
// This means that the PFI will trust SanctionsCredentials issued by this faux issuer.
const issuer: PortableDid = await createOrLoadDid('issuer.json')
console.log('issuer did:', issuer.did)


//
//
// Create a did for Alice, who is the customer of the PFI in this case.
const alice = await createOrLoadDid('alice.json')
console.log('alice did:', alice.did)

//
//
// Create a sanctions credential so that the PFI knows that Alice is legit.
// This is normally done by a third party.
const vc = await VerifiableCredential.create({
  type    : 'SanctionCredential',
  issuer  : issuer.did,
  subject : alice.did,
  data    : {
    'beep': 'boop'
  }
})
const vcJwt = await vc.sign({ did: issuer })

//
//
// And here we go with tbdex-protocol!
const rfq = Rfq.create({
  metadata: { from: alice.did, to: PFI_DID.did },
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
    claims: [vcJwt]
  }
})

await rfq.sign(alice)

await TbdexHttpClient.sendMessage({ message: rfq })

//
//
// All interaction with the PFI happens in the context of an exchange.
// This is where for example a quote would show up in result to an RFQ.
const exchanges = await TbdexHttpClient.getExchanges({
  pfiDid: PFI_DID.did,
  did: alice,
  filter: { id: rfq.exchangeId }
})

console.log('exchanges', JSON.stringify(exchanges, null, 2))
