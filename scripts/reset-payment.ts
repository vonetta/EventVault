import { connectDB } from '../src/lib/db';
import { Guest } from '../src/lib/models';

(async () => {
  await connectDB();
  
  const guest = await Guest.findOne({ ticketCode: 'EV-4L2VLDGU' });
  if (guest) {
    console.log('Before:', guest.personalPhotosPaid);
    guest.personalPhotosPaid = false;
    guest.personalPhotosPaidAt = null;
    await guest.save();
    console.log('After - Reset to:', guest.personalPhotosPaid);
  } else {
    console.log('Guest not found');
  }
  process.exit(0);
})();
