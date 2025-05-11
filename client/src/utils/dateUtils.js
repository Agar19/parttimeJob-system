/**
 * Formats a date string to local date and time with timezone correction
 * @param {string} dateTimeStr - The date string to format
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
export const formatLocalDate = (dateTimeStr, includeTime = true) => {
  if (!dateTimeStr) return '';
  
  const date = new Date(dateTimeStr);
  
  // Adjust for the timezone offset - subtract one day
  date.setDate(date.getDate() - 1);
  
  // Format date parts
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Format time if needed
  if (includeTime) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
  
  return `${year}-${month}-${day}`;
};

/**
 * Formats a date string to show only time
 * @param {string} dateTimeStr - The date string to format
 * @returns {string} Formatted time string
 */
export const formatTimeOnly = (dateTimeStr) => {
  if (!dateTimeStr) return '';
  
  const date = new Date(dateTimeStr);
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
};