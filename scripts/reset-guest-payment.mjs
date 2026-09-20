import { connectDB } from '../src/lib/db.js';
import { Guest } from '../src/lib/models.js';

await connectDB();

const guest = await Guest.findOne({ ticketCode: 'EV-4L2VLDGU' });
if (!guest) {
  console.log('Guest not found');
  process.exit(1);
}

console.log('Before:', { 
  name: guest.name, 
  personalPhotosPaid: guest.personalPhotosPaid 
});

guest.personalPhotosPaid = false;
guest.personalPhotosPaidAt = null;
await guest.save();

console.log('After:', { 
  name: guest.name, 
  personalPhotosPaid: guest.personalPhotosPaid 
});

process.exit(0);
