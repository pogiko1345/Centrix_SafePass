const User = require('../models/User');

const officeKey = (value) => String(value || '').trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');

const buildStaffDirectory = (users, configuredOffices = []) => {
  const disabled = new Set(configuredOffices.filter(o => o.deleted || o.enabled === false).map(o => officeKey(o.label)));
  const staff = users.filter(user => user.role === 'staff' && user.isActive === true && user.status === 'active')
    .filter(user => officeKey(user.department) && !disabled.has(officeKey(user.department)))
    .map(user => ({
      id: String(user._id),
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      department: String(user.department).trim(),
      position: String(user.position || '').trim(),
    })).sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const offices = [...new Map(staff.map(user => [officeKey(user.department), { label: user.department, enabled: true }])).values()];
  const labels = new Map(offices.map(office => [officeKey(office.label), office.label]));
  staff.forEach(user => { user.department = labels.get(officeKey(user.department)); });
  return { staff, offices };
};

const getStaffDirectory = async (configuredOffices) => {
  const users = await User.find({ role: 'staff', isActive: true, status: 'active' })
    .select('_id firstName lastName department position role isActive status').lean();
  return buildStaffDirectory(users, configuredOffices);
};

const parseStaffAssignments = (input) => {
  if (input == null || input === '') return {};
  let assignments = input;
  if (typeof input === 'string') {
    try { assignments = JSON.parse(input); } catch { throw Object.assign(new Error('Invalid staff selection.'), { status: 400 }); }
  }
  if (!assignments || Array.isArray(assignments) || typeof assignments !== 'object' || Object.keys(assignments).length > 30) {
    throw Object.assign(new Error('Invalid staff selection.'), { status: 400 });
  }
  const result = Object.create(null);
  for (const [office, id] of Object.entries(assignments)) {
    if (!office.trim() || typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
      throw Object.assign(new Error('Please select an available staff account.'), { status: 400 });
    }
    result[office.trim()] = id;
  }
  return result;
};

module.exports = { officeKey, buildStaffDirectory, getStaffDirectory, parseStaffAssignments };
