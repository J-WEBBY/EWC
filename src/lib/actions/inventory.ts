'use server';

// =============================================================================
// Inventory & Equipment — Server Actions
// Consumables stock, equipment register, AI reorder prediction, CQC compliance
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type ItemCategory = 'consumable' | 'equipment' | 'medication' | 'ppe';
export type StockStatus = 'ok' | 'low' | 'critical' | 'out_of_stock' | 'on_order';
export type EquipmentStatus = 'operational' | 'due_service' | 'overdue_service' | 'out_of_service';

export interface ConsumableItem {
  id: string;
  name: string;
  category: ItemCategory;
  sku: string | null;
  supplier: string;
  unit: string;         // e.g. 'box', 'ml', 'units'
  current_stock: number;
  reorder_level: number;
  reorder_quantity: number;
  cost_per_unit: number;
  last_ordered: string | null;
  last_restocked: string | null;
  stock_status: StockStatus;
  cqc_relevant: boolean;
  treatment_link: string | null;   // which treatment this supplies
  ai_reorder_prediction: string | null;   // AI predicted reorder date
  expiry_date?: string | null;
  batch_number?: string | null;
  storage_requirements?: string | null;
  supplier_contact?: string | null;
  supplier_phone?: string | null;
}

export interface EquipmentItem {
  id: string;
  name: string;
  model: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  purchase_date: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  service_interval_months: number;
  calibration_due: string | null;
  equipment_status: EquipmentStatus;
  cqc_registered: boolean;
  cqc_registration_number: string | null;
  location: string;
  responsible_person: string;
  notes: string | null;
}

export interface InventoryStats {
  total_consumables: number;
  low_stock_count: number;
  critical_stock_count: number;
  total_equipment: number;
  equipment_due_service: number;
  equipment_overdue_service: number;
  estimated_reorder_value: number;
}

export interface AIReorderRecommendation {
  item_id: string;
  item_name: string;
  recommended_quantity: number;
  urgency: 'urgent' | 'soon' | 'planned';
  reason: string;
  estimated_cost: number;
}

// =============================================================================
// DEMO DATA
// =============================================================================

const DEMO_CONSUMABLES: ConsumableItem[] = [
  {
    id: 'inv-001',
    name: 'Botulinum Toxin (Bocouture 50u)',
    category: 'medication',
    sku: 'BOC-50U',
    supplier: 'Merz Aesthetics',
    unit: 'vial',
    current_stock: 4,
    reorder_level: 5,
    reorder_quantity: 10,
    cost_per_unit: 85,
    last_ordered: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    last_restocked: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    stock_status: 'low',
    cqc_relevant: true,
    treatment_link: 'botox',
    ai_reorder_prediction: 'Order by Thu — 3 Botox appointments this week will deplete current stock.',
  },
  {
    id: 'inv-002',
    name: 'Juvéderm Ultra 1ml',
    category: 'medication',
    sku: 'JUV-ULT-1ML',
    supplier: 'Allergan / AbbVie',
    unit: 'syringe',
    current_stock: 8,
    reorder_level: 5,
    reorder_quantity: 12,
    cost_per_unit: 68,
    last_ordered: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    last_restocked: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    stock_status: 'ok',
    cqc_relevant: true,
    treatment_link: 'filler',
    ai_reorder_prediction: 'Adequate stock. Next reorder estimated in 12 days.',
  },
  {
    id: 'inv-003',
    name: 'Hyalase (Hyaluronidase 1500 IU)',
    category: 'medication',
    sku: 'HYA-1500',
    supplier: 'Alliance Pharma',
    unit: 'vial',
    current_stock: 1,
    reorder_level: 2,
    reorder_quantity: 5,
    cost_per_unit: 42,
    last_ordered: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    last_restocked: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    stock_status: 'critical',
    cqc_relevant: true,
    treatment_link: 'filler',
    ai_reorder_prediction: 'URGENT — Hyalase is critical safety stock for vascular occlusion. Order immediately.',
  },
  {
    id: 'inv-004',
    name: 'Clinell Universal Wipes',
    category: 'consumable',
    sku: 'CLIN-WIPE-200',
    supplier: 'Clinell / Gama Healthcare',
    unit: 'tub (200 wipes)',
    current_stock: 12,
    reorder_level: 6,
    reorder_quantity: 10,
    cost_per_unit: 8.50,
    last_ordered: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_restocked: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    stock_status: 'ok',
    cqc_relevant: true,
    treatment_link: null,
    ai_reorder_prediction: 'Stock sufficient for 3+ weeks based on current usage rate.',
  },
  {
    id: 'inv-005',
    name: 'Sterile Gloves (M) Box',
    category: 'ppe',
    sku: 'GLV-STR-M',
    supplier: 'Cranberry',
    unit: 'box (50 pairs)',
    current_stock: 3,
    reorder_level: 4,
    reorder_quantity: 8,
    cost_per_unit: 12,
    last_ordered: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    last_restocked: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
    stock_status: 'low',
    cqc_relevant: true,
    treatment_link: null,
    ai_reorder_prediction: 'Reorder this week — stock will last ~5 days at current appointment volume.',
  },
  {
    id: 'inv-006',
    name: '30G x 13mm Needles',
    category: 'consumable',
    sku: 'NDL-30G-13',
    supplier: 'BD Medical',
    unit: 'box (100)',
    current_stock: 9,
    reorder_level: 3,
    reorder_quantity: 10,
    cost_per_unit: 6.80,
    last_ordered: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    last_restocked: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    stock_status: 'ok',
    cqc_relevant: false,
    treatment_link: 'botox',
    ai_reorder_prediction: 'Adequate for 6+ weeks.',
  },
];

const DEMO_EQUIPMENT: EquipmentItem[] = [
  {
    id: 'eq-001',
    name: 'CoolSculpting Elite System',
    model: 'CoolSculpting Elite',
    serial_number: 'CS-ELITE-77342',
    manufacturer: 'Allergan / Zeltiq',
    purchase_date: '2023-06-15',
    last_service_date: '2024-06-15',
    next_service_date: '2025-06-15',
    service_interval_months: 12,
    calibration_due: '2025-06-15',
    equipment_status: 'operational',
    cqc_registered: true,
    cqc_registration_number: 'CQC-DEV-2023-4421',
    location: 'Treatment Room 2',
    responsible_person: 'Dr Suresh Ganata',
    notes: 'Annual manufacturer service due June 2025.',
  },
  {
    id: 'eq-002',
    name: 'Ultrasound Imaging Unit',
    model: 'Sonosite PX',
    serial_number: 'SNS-PX-33891',
    manufacturer: 'Fujifilm Sonosite',
    purchase_date: '2022-03-10',
    last_service_date: '2023-09-10',
    next_service_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    service_interval_months: 18,
    calibration_due: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    equipment_status: 'overdue_service',
    cqc_registered: true,
    cqc_registration_number: 'CQC-DEV-2022-1187',
    location: 'Treatment Room 1',
    responsible_person: 'Dr Suresh Ganata',
    notes: 'Service overdue — book engineer visit urgently.',
  },
  {
    id: 'eq-003',
    name: 'Autoclave / Steriliser',
    model: 'SES 2000',
    serial_number: 'SES-2000-19281',
    manufacturer: 'SciCan',
    purchase_date: '2021-11-01',
    last_service_date: new Date(Date.now() - 310 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    next_service_date: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    service_interval_months: 12,
    calibration_due: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    equipment_status: 'due_service',
    cqc_registered: true,
    cqc_registration_number: 'CQC-DEV-2021-8873',
    location: 'Decontamination Room',
    responsible_person: 'Clinical Lead',
    notes: 'Service due in ~2 months. Book engineer.',
  },
  {
    id: 'eq-004',
    name: 'Emergency Anaphylaxis Kit',
    model: 'EpiPen Pro 300mcg',
    serial_number: null,
    manufacturer: 'Pfizer',
    purchase_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    last_service_date: null,
    next_service_date: new Date(Date.now() + 275 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    service_interval_months: 12,
    calibration_due: null,
    equipment_status: 'operational',
    cqc_registered: true,
    cqc_registration_number: 'CQC-EMRG-2024-001',
    location: 'Reception / all treatment rooms',
    responsible_person: 'All clinical staff',
    notes: 'Check expiry monthly. Replace annually or on use.',
  },
];

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getInventoryData(
  _tenantId: string,
): Promise<{ success: boolean; data?: { consumables: ConsumableItem[]; equipment: EquipmentItem[]; stats: InventoryStats }; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const supabase = createSovereignClient();
    await supabase.from('clinic_config').select('id').limit(1);

    const consumables = DEMO_CONSUMABLES;
    const equipment = DEMO_EQUIPMENT;

    const stats: InventoryStats = {
      total_consumables: consumables.length,
      low_stock_count: consumables.filter(c => c.stock_status === 'low').length,
      critical_stock_count: consumables.filter(c => c.stock_status === 'critical').length,
      total_equipment: equipment.length,
      equipment_due_service: equipment.filter(e => e.equipment_status === 'due_service').length,
      equipment_overdue_service: equipment.filter(e => e.equipment_status === 'overdue_service').length,
      estimated_reorder_value: consumables
        .filter(c => c.stock_status === 'low' || c.stock_status === 'critical')
        .reduce((s, c) => s + c.reorder_quantity * c.cost_per_unit, 0),
    };

    return { success: true, data: { consumables, equipment, stats } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAIReorderRecommendations(
  _tenantId: string,
): Promise<{ success: boolean; data?: AIReorderRecommendation[]; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const client = getAnthropicClient();
    const lowItems = DEMO_CONSUMABLES.filter(c => c.stock_status !== 'ok');

    if (lowItems.length === 0) return { success: true, data: [] };

    const itemList = lowItems.map(i => `${i.name}: stock=${i.current_stock} ${i.unit}, reorder_level=${i.reorder_level}, cost=£${i.cost_per_unit}/${i.unit}, treatment=${i.treatment_link ?? 'general'}`).join('\n');

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Clinic inventory AI. Provide reorder recommendations for these low-stock items at Edgbaston Wellness Clinic:\n\n${itemList}\n\nRespond with JSON array: [{ "item_id": "...", "item_name": "...", "recommended_quantity": 10, "urgency": "urgent|soon|planned", "reason": "...", "estimated_cost": 100 }]`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array');
    return { success: true, data: JSON.parse(jsonMatch[0]) };
  } catch {
    return {
      success: true,
      data: [
        { item_id: 'inv-003', item_name: 'Hyalase (Hyaluronidase)', recommended_quantity: 5, urgency: 'urgent', reason: 'Critical safety stock for vascular occlusion emergency — must maintain minimum 2 vials at all times.', estimated_cost: 210 },
        { item_id: 'inv-001', item_name: 'Bocouture Botulinum Toxin', recommended_quantity: 10, urgency: 'soon', reason: '3 Botox appointments scheduled this week will deplete current stock below reorder level.', estimated_cost: 850 },
        { item_id: 'inv-005', item_name: 'Sterile Gloves (M)', recommended_quantity: 8, urgency: 'soon', reason: 'Stock will last ~5 working days at current appointment volume.', estimated_cost: 96 },
      ],
    };
  }
}

export async function updateStockLevel(
  _tenantId: string,
  itemId: string,
  newStock: number,
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  void itemId; void newStock;
  return { success: true };
}

export async function markEquipmentServiced(
  _tenantId: string,
  equipmentId: string,
  servicedDate: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  void equipmentId; void servicedDate;
  return { success: true };
}

// =============================================================================
// EXPIRY TRACKING
// =============================================================================

export interface ExpiryItem {
  id: string;
  name: string;
  category: ItemCategory;
  batch_number: string;
  expiry_date: string;         // ISO date
  quantity: number;
  unit: string;
  supplier: string;
  supplier_contact: string | null;
  supplier_phone: string | null;
  storage_requirements: string | null;
  cqc_relevant: boolean;
  treatment_link: string | null;
  days_until_expiry: number;   // computed
  expiry_status: 'ok' | 'expiring_soon' | 'expired';
}

const DEMO_EXPIRY_ITEMS: Omit<ExpiryItem, 'days_until_expiry' | 'expiry_status'>[] = [
  {
    id: 'exp-001', name: 'Bocouture 50u (Batch A)', category: 'medication',
    batch_number: 'BCR-2025-4421', expiry_date: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantity: 3, unit: 'vial', supplier: 'Merz Aesthetics',
    supplier_contact: 'orders@merzaesthetics.co.uk', supplier_phone: '0800 888 4455',
    storage_requirements: 'Refrigerate 2–8°C. Do not freeze.',
    cqc_relevant: true, treatment_link: 'Botox Anti-Wrinkle',
  },
  {
    id: 'exp-002', name: 'Juvéderm Ultra 1ml (Batch B)', category: 'medication',
    batch_number: 'JUV-2025-7733', expiry_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantity: 5, unit: 'syringe', supplier: 'Allergan / AbbVie',
    supplier_contact: 'uk.aesthetics@abbvie.com', supplier_phone: '01628 515 000',
    storage_requirements: 'Room temperature. Below 25°C. Do not freeze.',
    cqc_relevant: true, treatment_link: 'Dermal Fillers',
  },
  {
    id: 'exp-003', name: 'Hyalase 1500 IU (Safety Stock)', category: 'medication',
    batch_number: 'HYA-2025-1102', expiry_date: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantity: 1, unit: 'vial', supplier: 'Alliance Pharma',
    supplier_contact: 'orders@alliancepharmaceuticals.co.uk', supplier_phone: '01249 466 966',
    storage_requirements: 'Store below 25°C. Protect from light.',
    cqc_relevant: true, treatment_link: 'Emergency reversal agent',
  },
  {
    id: 'exp-004', name: 'Lidocaine 2% (Dental Cartridges)', category: 'medication',
    batch_number: 'LID-2026-0031', expiry_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantity: 12, unit: 'cartridge', supplier: 'Septodont UK',
    supplier_contact: null, supplier_phone: '01622 695 520',
    storage_requirements: 'Store at room temperature. Protect from light.',
    cqc_relevant: true, treatment_link: 'Lip Filler',
  },
  {
    id: 'exp-005', name: 'IV Vitamin C (25g/500ml)', category: 'medication',
    batch_number: 'IVC-2025-8844', expiry_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantity: 2, unit: 'bag', supplier: 'Allma Healthcare',
    supplier_contact: 'info@allma.co.uk', supplier_phone: null,
    storage_requirements: 'Refrigerate 2–8°C. Use within 24h of opening.',
    cqc_relevant: true, treatment_link: 'IV Therapy',
  },
  {
    id: 'exp-006', name: 'Semaglutide 0.5mg (Ozempic pens)', category: 'medication',
    batch_number: 'SEM-2025-3311', expiry_date: new Date(Date.now() + 62 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantity: 4, unit: 'pen', supplier: 'Novo Nordisk',
    supplier_contact: 'medinfo@novonordisk.com', supplier_phone: '01293 613 555',
    storage_requirements: 'Refrigerate 2–8°C. Opened pen: room temp, use within 4 weeks.',
    cqc_relevant: true, treatment_link: 'Weight Management',
  },
];

export async function getExpiryTracking(_tenantId: string): Promise<{ success: boolean; data?: ExpiryItem[]; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const now = Date.now();
  const data: ExpiryItem[] = DEMO_EXPIRY_ITEMS.map(item => {
    const days = Math.round((new Date(item.expiry_date).getTime() - now) / 86400000);
    const expiry_status: ExpiryItem['expiry_status'] = days < 0 ? 'expired' : days <= 30 ? 'expiring_soon' : 'ok';
    return { ...item, days_until_expiry: days, expiry_status };
  }).sort((a, b) => a.days_until_expiry - b.days_until_expiry);
  return { success: true, data };
}
