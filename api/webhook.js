// File: /api/webhook.js
const fetch = require('node-fetch');

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const PIPEDRIVE_COMPANY_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const webflowData = req.body;
    const formData = webflowData.data;
    
    // Create a descriptive lead title
    const pipedriveData = {
      title: `New Patient Inquiry - ${formData.name || 'Unknown'}`,
      person_id: null,
      value: {
        amount: 0,
        currency: 'AUD'
      },
      status: 'open',
      label: 'Contact Form'
    };

    // Create person in Pipedrive
    const personResponse = await fetch(
      `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/persons`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${PIPEDRIVE_API_KEY}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: [{ value: formData.email_address, primary: true }],
          phone: [{ value: formData.contact_number, primary: true }]
        })
      }
    );

    const personData = await personResponse.json();
    if (!personResponse.ok) {
      throw new Error(`Failed to create person: ${JSON.stringify(personData)}`);
    }

    pipedriveData.person_id = personData.data.id;

    // Create lead in Pipedrive
    const leadResponse = await fetch(
      `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/leads`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${PIPEDRIVE_API_KEY}`
        },
        body: JSON.stringify(pipedriveData)
      }
    );

    const leadData = await leadResponse.json();
    if (!leadResponse.ok) {
      throw new Error(`Failed to create lead: ${JSON.stringify(leadData)}`);
    }

    // Add note with all form information
    const noteContent = `
New Patient Inquiry Details:
--------------------------
Name: ${formData.name}
Email: ${formData.email_address}
Contact Number: ${formData.contact_number}
Preferred Call Time: ${formData.preferred_call_time}

Source: Tarneith Health Hub Website Contact Form
Submission Time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
    `.trim();

    await fetch(
      `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/notes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${PIPEDRIVE_API_KEY}`
        },
        body: JSON.stringify({
          content: noteContent,
          lead_id: leadData.data.id
        })
      }
    );

    return res.status(200).json({
      message: 'Successfully created lead in Pipedrive',
      leadId: leadData.data.id
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      message: 'Error processing webhook',
      error: error.message
    });
  }
}