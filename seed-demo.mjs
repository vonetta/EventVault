import mongoose from 'mongoose';
import fs from 'fs';

const MONGODB_URI = 'mongodb://127.0.0.1:27017/eventvault';

const EventSchema = new mongoose.Schema({
  name: String,
  slug: String,
  description: String,
  startsOn: String,
  endsOn: String,
}, { timestamps: true });

const DaySchema = new mongoose.Schema({
  eventId: mongoose.Schema.Types.ObjectId,
  label: String,
  date: String,
  sortOrder: Number,
}, { timestamps: true });

const GuestSchema = new mongoose.Schema({
  eventId: mongoose.Schema.Types.ObjectId,
  name: String,
  email: String,
  tier: String,
  ticketCode: String,
}, { timestamps: true });

const Event = mongoose.models.Event || mongoose.model('Event', EventSchema);
const Day = mongoose.models.Day || mongoose.model('Day', DaySchema);
const Guest = mongoose.models.Guest || mongoose.model('Guest', GuestSchema);

async function seed() {
  await mongoose.connect(MONGODB_URI, {});
  
  // Create event
  const event = await Event.create({
    name: 'Weekend Gathering',
    slug: 'weekend-gathering',
    description: 'A three-day gathering',
    startsOn: '2026-08-22',
    endsOn: '2026-08-24',
  });
  
  console.log('Created event:', event.name);
  
  // Create days
  const days = await Day.insertMany([
    { eventId: event._id, label: 'Day 1', date: '2026-08-22', sortOrder: 0 },
    { eventId: event._id, label: 'Day 2', date: '2026-08-23', sortOrder: 1 },
    { eventId: event._id, label: 'Day 3', date: '2026-08-24', sortOrder: 2 },
  ]);
  
  console.log(`Created ${days.length} days`);
  
  // Create guests with ticket codes
  const vipCode = 'EV-VIP12345';
  const stdCode = 'EV-STD67890';
  
  const guests = await Guest.insertMany([
    {
      eventId: event._id,
      name: 'Jane Doe',
      email: 'jane@email.com',
      tier: 'vip',
      ticketCode: vipCode,
    },
    {
      eventId: event._id,
      name: 'John Smith',
      email: 'john@email.com',
      tier: 'standard',
      ticketCode: stdCode,
    },
  ]);
  
  console.log(`Created ${guests.length} guests`);
  console.log(`VIP ticket: ${vipCode}`);
  console.log(`Standard ticket: ${stdCode}`);
  
  // Save tickets to files
  fs.writeFileSync('/tmp/ev-vip-ticket.txt', vipCode);
  fs.writeFileSync('/tmp/ev-std-ticket.txt', stdCode);
  
  await mongoose.connection.close();
  console.log('Seed complete!');
}

seed().catch(console.error);
