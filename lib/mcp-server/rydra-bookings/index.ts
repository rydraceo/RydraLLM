// lib/mcp-server/rydra-bookings/index.ts
 
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { db, eq, and, gte, availableSlots, bookings, customers } from '@/lib/db';
 
const server = new Server(
  {
    name: 'rydra-bookings',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
 
// ─── TOOL DEFINITIONS ──────────────────────────────────────────────────────
 
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_available_slots',
      description: 'Find available booking slots at a Rydra venue',
      inputSchema: {
        type: 'object',
        properties: {
          venue_id: {
            type: 'string',
            description: 'The venue ID to search slots for',
          },
          service_type: {
            type: 'string',
            description: 'Type of service (e.g., "haircut", "beard trim")',
          },
          preferred_date: {
            type: 'string',
            description: 'Preferred date in ISO format (YYYY-MM-DD)',
          },
          preferred_barber: {
            type: 'string',
            description: 'Optional: preferred barber name',
          },
        },
        required: ['venue_id', 'service_type', 'preferred_date'],
      },
    },
    {
      name: 'create_booking',
      description: 'Book an appointment at a Rydra venue',
      inputSchema: {
        type: 'object',
        properties: {
          venue_id: {
            type: 'string',
            description: 'The venue ID',
          },
          slot_id: {
            type: 'string',
            description: 'The slot ID from search_available_slots',
          },
          customer_phone: {
            type: 'string',
            description: 'Customer phone number',
          },
          customer_name: {
            type: 'string',
            description: 'Customer full name',
          },
        },
        required: ['venue_id', 'slot_id', 'customer_phone', 'customer_name'],
      },
    },
  ],
}));
 
// ─── TOOL HANDLERS ─────────────────────────────────────────────────────────
 
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'search_available_slots') {
    const { venue_id, preferred_date, preferred_barber } = request.params.arguments as {
      venue_id: string;
      preferred_date: string;
      preferred_barber?: string;
    };
 
    // Parse the date
    const searchDate = new Date(preferred_date);
    const endOfDay = new Date(searchDate);
    endOfDay.setHours(23, 59, 59, 999);
 
    // Query available slots
    const slots = await db.query.availableSlots.findMany({
      where: and(
        eq(availableSlots.venue_id, venue_id),
        eq(availableSlots.is_booked, false),
        gte(availableSlots.start_time, searchDate),
        preferred_barber 
          ? eq(availableSlots.barber_name, preferred_barber)
          : undefined
      ),
      orderBy: (slots, { asc }) => [asc(slots.start_time)],
    });
 
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(slots, null, 2),
        },
      ],
    };
  }
 
  if (request.params.name === 'create_booking') {
    const { venue_id, slot_id, customer_phone, customer_name } = request.params.arguments as {
      venue_id: string;
      slot_id: string;
      customer_phone: string;
      customer_name: string;
    };
 
    const booking = await createBooking({
      venue_id,
      slot_id,
      customer_phone,
      customer_name,
    });
 
    return {
      content: [
        {
          type: 'text',
          text: `✅ Booking confirmed: ${booking.id}`,
        },
      ],
    };
  }
 
  throw new Error(`Unknown tool: ${request.params.name}`);
});
 
// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────
 
async function createBooking(params: {
  venue_id: string;
  slot_id: string;
  customer_phone: string;
  customer_name: string;
}) {
  // Find or create customer
  let customer = await db.query.customers.findFirst({
    where: and(
      eq(customers.venue_id, params.venue_id),
      eq(customers.phone, params.customer_phone)
    ),
  });
 
  if (!customer) {
    const [newCustomer] = await db.insert(customers).values({
      venue_id: params.venue_id,
      name: params.customer_name,
      phone: params.customer_phone,
    }).returning();
    customer = newCustomer;
  }
 
  // Get slot details
  const slot = await db.query.availableSlots.findFirst({
    where: eq(availableSlots.id, params.slot_id),
  });
 
  if (!slot) {
    throw new Error('Slot not found');
  }
 
  if (slot.is_booked) {
    throw new Error('Slot already booked');
  }
 
  // Create booking
  const [booking] = await db.insert(bookings).values({
    venue_id: params.venue_id,
    customer_id: customer.id,
    slot_id: params.slot_id,
    barber_name: slot.barber_name,
    scheduled_at: slot.start_time,
    status: 'confirmed',
  }).returning();
 
  // Mark slot as booked
  await db.update(availableSlots)
    .set({ is_booked: true })
    .where(eq(availableSlots.id, params.slot_id));
 
  return booking;
}
 
// ─── START SERVER ──────────────────────────────────────────────────────────
 
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('🚀 Rydra MCP Server running');
}
 
main().catch(console.error);
 