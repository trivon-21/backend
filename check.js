const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
.then(async () => {
    try {
        const ServiceRequest = require('./backend/src/models/ServiceRequest');
        const NewRequest = require('./backend/src/modules/shared/serviceTicket/serviceTicket.model');
        const Customer = require('./backend/src/modules/user/user.model');
        const Installation = require('./backend/src/modules/shared/installation/installation.model');
        
        let sr = await ServiceRequest.findOne({ $or: [{ ticketId: /SRQ-1006/i }, { serviceRequestId: /SRQ-1006/i }] });
        console.log('ServiceRequest found:', sr ? 'yes' : 'no');
        
        if (!sr) {
            sr = await NewRequest.findOne({ $or: [{ ticketId: /SRQ-1006/i }, { serviceRequestId: /SRQ-1006/i }] });
            console.log('NewRequest found:', sr ? 'yes' : 'no');
        }
        
        if (sr) {
            console.log('Ticket customer ID:', sr.customerId);
            
            // Recalculate
            const warrantyUtils = require('./backend/src/utils/warranty.utils');
            const { isUnderWarranty, isFreeOfCharge } = await warrantyUtils.calculateWarrantyStatus(
              sr.customerId,
              'Repair'
            );
            console.log('Calculated warranty:', { isUnderWarranty, isFreeOfCharge });
            
            // Fix it if it's ServiceRequest
            if (sr.collection.name === 'servicerequests' || sr.collection.name === 'newrequests') {
                sr.isUnderWarranty = isUnderWarranty;
                sr.isFreeOfCharge = isFreeOfCharge;
                await sr.save();
                console.log('Updated Request in DB.');
            }
        } else {
            console.log('Ticket not found.');
        }
    } catch(e) { console.error(e); }
    process.exit();
}).catch(e => { console.error('Connection error', e); process.exit(1); });
