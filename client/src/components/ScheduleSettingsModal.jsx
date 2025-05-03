import React, { useState, useEffect } from 'react';
import api from '../services/api';

const ScheduleSettingsModal = ({ isOpen, onClose, onSave, initialSettings = {} }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState('');
  
  // Days of week in Mongolian
  const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  
  const [settings, setSettings] = useState({
    scheduleName: initialSettings.scheduleName || 'New Schedule',
    selectedDays: initialSettings.selectedDays || { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
    startTime: initialSettings.startTime || '07:00',
    endTime: initialSettings.endTime || '23:00',
    minGapBetweenShifts: initialSettings.minGapBetweenShifts || '8',
    minShiftsPerEmployee: initialSettings.minShiftsPerEmployee || '1',
    maxShiftsPerEmployee: initialSettings.maxShiftsPerEmployee || '5',
    minShiftLength: initialSettings.minShiftLength || '4',
    maxShiftLength: initialSettings.maxShiftLength || '8',
    maxEmployeesPerShift: initialSettings.maxEmployeesPerShift || '5',
    shiftIncrement: initialSettings.shiftIncrement || '2',
    additionalNotes: initialSettings.additionalNotes || ''
  });
  
  // Fetch saved templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await api.get('/schedules/templates');
        setTemplates(response.data);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSettings({ ...settings, [name]: value });
  };
  
  const handleDayToggle = (dayIndex) => {
    setSettings({
      ...settings,
      selectedDays: {
        ...settings.selectedDays,
        [dayIndex]: !settings.selectedDays[dayIndex]
      }
    });
  };
  
  const handleApplyTemplate = (template) => {
    // Convert array of selected days to object format
    const selectedDaysObj = {};
    if (Array.isArray(template.selectedDays)) {
      template.selectedDays.forEach(day => {
        selectedDaysObj[day] = true;
      });
      
      // Set days not in array to false
      for (let i = 0; i < 7; i++) {
        if (!template.selectedDays.includes(i)) {
          selectedDaysObj[i] = false;
        }
      }
    }
    
    setSettings({
      ...settings,
      selectedDays: selectedDaysObj,
      startTime: template.startTime || settings.startTime,
      endTime: template.endTime || settings.endTime,
      minGapBetweenShifts: template.minGapBetweenShifts?.toString() || settings.minGapBetweenShifts,
      minShiftsPerEmployee: template.minShiftsPerEmployee?.toString() || settings.minShiftsPerEmployee,
      maxShiftsPerEmployee: template.maxShiftsPerEmployee?.toString() || settings.maxShiftsPerEmployee,
      minShiftLength: template.minShiftLength?.toString() || settings.minShiftLength,
      maxShiftLength: template.maxShiftLength?.toString() || settings.maxShiftLength,
      maxEmployeesPerShift: template.maxEmployeesPerShift?.toString() || settings.maxEmployeesPerShift,
      shiftIncrement: template.shiftIncrement?.toString() || settings.shiftIncrement,
      additionalNotes: template.name || settings.additionalNotes
    });
  };
  
  const handleSaveTemplate = async () => {
    if (!templateName) {
      setError('Please enter a template name');
      return;
    }
    
    try {
      setSavingTemplate(true);
      
      // Convert selected days from object to array
      const selectedDaysArray = Object.keys(settings.selectedDays)
        .filter(day => settings.selectedDays[day])
        .map(day => parseInt(day));
      
      const templateData = {
        name: templateName,
        selectedDays: selectedDaysArray,
        startTime: settings.startTime,
        endTime: settings.endTime,
        minGapBetweenShifts: parseInt(settings.minGapBetweenShifts),
        minShiftsPerEmployee: parseInt(settings.minShiftsPerEmployee),
        maxShiftsPerEmployee: parseInt(settings.maxShiftsPerEmployee),
        minShiftLength: parseInt(settings.minShiftLength),
        maxShiftLength: parseInt(settings.maxShiftLength),
        maxEmployeesPerShift: parseInt(settings.maxEmployeesPerShift),
        shiftIncrement: parseInt(settings.shiftIncrement)
      };
      
      await api.post('/schedules/templates', templateData);
      
      // Refresh templates
      const response = await api.get('/schedules/templates');
      setTemplates(response.data);
      
      // Hide save template form
      setShowSaveTemplate(false);
      setTemplateName('');
      
    } catch (err) {
      console.error('Error saving template:', err);
      setError('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };
  
  const handleSaveSettings = () => {
    // Convert selected days from object to array for API
    const selectedDaysArray = Object.keys(settings.selectedDays)
      .filter(day => settings.selectedDays[day])
      .map(day => parseInt(day));
    
    const processedSettings = {
      scheduleName: settings.scheduleName,
      selected_days: selectedDaysArray,
      start_time: settings.startTime,
      end_time: settings.endTime,
      min_gap_between_shifts: parseInt(settings.minGapBetweenShifts),
      min_shifts_per_employee: parseInt(settings.minShiftsPerEmployee),
      max_shifts_per_employee: parseInt(settings.maxShiftsPerEmployee),
      min_shift_length: parseInt(settings.minShiftLength),
      max_shift_length: parseInt(settings.maxShiftLength),
      max_employees_per_shift: parseInt(settings.maxEmployeesPerShift),
      shift_increment: parseInt(settings.shiftIncrement),
      additional_notes: settings.additionalNotes
    };
    
    onSave(processedSettings);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto w-[90%] max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Хуваарь үүсгэх тохиргоо</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Хуваарийн нэр:
              </label>
              <input
                type="text"
                name="scheduleName"
                value={settings.scheduleName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ажлын өдрүүд:
              </label>
              <div className="flex flex-wrap gap-2">
                {daysOfWeek.map((day, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleDayToggle(index)}
                    className={`px-3 py-1 rounded-md ${
                      settings.selectedDays[index] 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
            
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Эхлэх цаг:
            </label>
            <select
                name="startTime"
                value={settings.startTime}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                {Array.from({ length: 24 }, (_, i) => {
                const hour = i; // Start from 0 (midnight)
                return `${hour.toString().padStart(2, '0')}:00`;
                }).map(time => (
                <option key={time} value={time}>{time}</option>
                ))}
            </select>
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Дуусах цаг:
            </label>
            <select
                name="endTime"
                value={settings.endTime}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                {Array.from({ length: 25 }, (_, i) => {
                const hour = i % 24; // Start from 0 (midnight) and go to 24 (next day midnight)
                return `${hour.toString().padStart(2, '0')}:00`;
                }).map(time => (
                <option key={time} value={time}>{time === "00:00" && settings.startTime !== "00:00" ? "24:00" : time}</option>
                ))}
            </select>
            </div>
            </div>
          </div>
        </div>
        
        <div className="my-6 border-t border-gray-200 pt-4">
          <h3 className="text-lg font-semibold mb-4">Хуваарийн параметрүүд</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Хуваарь хооронд шаардлагатай хугацаа:
              </label>
              <select
                name="minGapBetweenShifts"
                value={settings.minGapBetweenShifts}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="4">4 цаг</option>
                <option value="6">6 цаг</option>
                <option value="8">8 цаг</option>
                <option value="10">10 цаг</option>
                <option value="12">12 цаг</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Нэг ажилтаны 7 хоногт ажиллах доод тоо:
              </label>
              <select
                name="minShiftsPerEmployee"
                value={settings.minShiftsPerEmployee}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="1">1 ээлж</option>
                <option value="2">2 ээлж</option>
                <option value="3">3 ээлж</option>
                <option value="4">4 ээлж</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Нэг ажилтаны 7 хоногт ажиллах дээд тоо:
              </label>
              <select
                name="maxShiftsPerEmployee"
                value={settings.maxShiftsPerEmployee}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="3">3 ээлж</option>
                <option value="4">4 ээлж</option>
                <option value="5">5 ээлж</option>
                <option value="6">6 ээлж</option>
                <option value="7">7 ээлж</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Хамгийн бага ээлжийн урт (цагаар):
              </label>
              <select
                name="minShiftLength"
                value={settings.minShiftLength}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="2">2 цаг</option>
                <option value="3">3 цаг</option>
                <option value="4">4 цаг</option>
                <option value="5">5 цаг</option>
                <option value="6">6 цаг</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Хамгийн их ээлжийн урт (цагаар):
              </label>
              <select
                name="maxShiftLength"
                value={settings.maxShiftLength}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="4">4 цаг</option>
                <option value="6">6 цаг</option>
                <option value="8">8 цаг</option>
                <option value="10">10 цаг</option>
                <option value="12">12 цаг</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Нэг ээлжинд ажиллах хүний тоо (хамгийн их):
              </label>
              <select
                name="maxEmployeesPerShift"
                value={settings.maxEmployeesPerShift}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="1">1 хүн</option>
                <option value="2">2 хүн</option>
                <option value="3">3 хүн</option>
                <option value="4">4 хүн</option>
                <option value="5">5 хүн</option>
                <option value="6">6 хүн</option>
                <option value="7">7 хүн</option>
                <option value="8">8 хүн</option>
              </select>
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ээлжийн өөрчлөлтийн интервал (цагаар):
            </label>
            <select
              name="shiftIncrement"
              value={settings.shiftIncrement}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="1">1 цаг</option>
              <option value="2">2 цаг</option>
              <option value="3">3 цаг</option>
              <option value="4">4 цаг</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Энэ параметр нь ээлжийн уртын алхам юм. Жишээ нь: 2 цаг гэвэл 4,6,8 цагийн урттай ээлж үүсгэнэ.
            </p>
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тэмдэглэл (Template нэр):
            </label>
            <input
              type="text"
              name="additionalNotes"
              value={settings.additionalNotes}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Нэмэлт тэмдэглэл эсвэл темплэйтийн нэр"
            />
          </div>
        </div>
        
        {/* Saved Templates Section */}
        <div className="my-6 border-t border-gray-200 pt-4">
          <h3 className="text-lg font-semibold mb-2">Хадгалсан темплэйтүүд</h3>
          
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Темплэйт ачааллаж байна...</p>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-600 py-2">Одоогоор хадгалсан темплэйт байхгүй байна.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {templates.map(template => (
                <div 
                  key={template.id}
                  className="bg-gray-50 border border-gray-200 rounded-md p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleApplyTemplate(template)}
                >
                  <h4 className="font-medium">{template.name}</h4>
                  <div className="text-xs text-gray-500 mt-1">
                    {template.startTime} - {template.endTime} | {template.minShiftsPerEmployee} - {template.maxShiftsPerEmployee} ээлж
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Save Template Button */}
          <div className="mt-4">
            {showSaveTemplate ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Темплэйтын нэр"
                />
                <button
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                >
                  {savingTemplate ? 'Хадгалж байна...' : 'Хадгалах'}
                </button>
                <button
                  onClick={() => setShowSaveTemplate(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Цуцлах
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveTemplate(true)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Темплэйт хэлбэрээр хадгалах
              </button>
            )}
          </div>
        </div>
        
        <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Цуцлах
          </button>
          <button
            onClick={handleSaveSettings}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Тохиргоо хадгалж хуваарь үүсгэх
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleSettingsModal;