-- Fix crm_agent display_name from 'Arry' to 'Aria'
UPDATE agents SET display_name = 'Aria' WHERE agent_key = 'crm_agent';
