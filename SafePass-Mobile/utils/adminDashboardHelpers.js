const normalizeValue = (value) => String(value || "").trim().toLowerCase();

export const sortUsersByName = (users = []) =>
  [...users].sort((a, b) => {
    const nameA = `${a?.firstName || ""} ${a?.lastName || ""}`.trim().toLowerCase();
    const nameB = `${b?.firstName || ""} ${b?.lastName || ""}`.trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });

export const getUserStatusGroups = (users = [], isUserActive) => {
  const active = users.filter((userItem) => isUserActive(userItem));
  const inactive = users.filter((userItem) => !isUserActive(userItem));
  return { active, inactive };
};

export const filterAdminUsers = ({
  users = [],
  accountMode = "all",
  roleFilter = "all",
  departmentFilter = "all",
  searchQuery = "",
  isSecurityRole,
  isUserActive,
  recordMatchesSearch,
  normalizeFilterValue = normalizeValue,
}) => {
  let filtered = [...users];

  if (accountMode === "staff") {
    filtered = filtered.filter((userItem) => userItem.role === "staff");
  } else if (accountMode === "security") {
    filtered = filtered.filter((userItem) => isSecurityRole(userItem.role));
  }

  if (roleFilter !== "all" && roleFilter !== "active" && roleFilter !== "inactive") {
    filtered = filtered.filter((userItem) =>
      roleFilter === "security" ? isSecurityRole(userItem.role) : userItem.role === roleFilter,
    );
  }

  if (roleFilter === "active") {
    filtered = filtered.filter((userItem) => isUserActive(userItem));
  }

  if (roleFilter === "inactive") {
    filtered = filtered.filter((userItem) => !isUserActive(userItem));
  }

  if (departmentFilter !== "all") {
    filtered = filtered.filter(
      (userItem) => normalizeFilterValue(userItem.department || "General") === departmentFilter,
    );
  }

  if (String(searchQuery || "").trim()) {
    filtered = filtered.filter((userItem) =>
      recordMatchesSearch(userItem, searchQuery, [
        "firstName",
        "lastName",
        "username",
        "email",
        "phone",
        "department",
        "employeeId",
        "studentId",
        "teacherId",
        "role",
        "status",
        "nfcCardId",
        (item) => `${item.firstName || ""} ${item.lastName || ""}`,
      ]),
    );
  }

  return sortUsersByName(filtered);
};

export const buildDepartmentFilterOptions = ({
  users = [],
  limit = 8,
  normalizeFilterValue = normalizeValue,
  allLabel = "All Departments",
}) => {
  const departmentMap = new Map();

  users.forEach((userItem) => {
    const label = userItem.department || "General";
    const key = normalizeFilterValue(label);
    departmentMap.set(key, {
      key,
      label,
      count: (departmentMap.get(key)?.count || 0) + 1,
      icon: "business-outline",
    });
  });

  return [
    { key: "all", label: allLabel, count: users.length, icon: "apps-outline" },
    ...Array.from(departmentMap.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, limit),
  ];
};

export const countMapActivitiesByFilter = (activities = [], getFilterKey) =>
  activities.reduce(
    (counts, activity) => {
      const key = getFilterKey(activity?.activityType, activity?.accessType);
      counts.all += 1;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    },
    { all: 0, requests: 0, approvals: 0, movement: 0, issues: 0 },
  );
