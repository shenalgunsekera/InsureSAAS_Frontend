import React, { useState } from 'react';
import { Button, TextField, Box, Typography, InputLabel, Link } from '@mui/material';
import { openFile } from '../cloudinary';

const ClientForm = ({ onSubmit, initialData = {}, isEdit = false }) => {
  const [name, setName] = useState(initialData.name || '');
  const [nic, setNic] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || (!nic && !isEdit) || (!policy && !isEdit)) {
      setError('Name, NIC, and Policy documents are required');
      return;
    }
    const formData = new FormData();
    formData.append('name', name);
    if (nic) formData.append('nic', nic);
    if (policy) formData.append('policy', policy);
    onSubmit(formData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 2 }}>
      <Typography variant="h6" gutterBottom>{isEdit ? 'Edit Client' : 'Add Client'}</Typography>
      <TextField
        label="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        fullWidth
        required
        sx={{ mb: 2 }}
      />
      <InputLabel sx={{ mb: 1 }}>NIC Document {isEdit && initialData.document_url && (
        <Link onClick={() => openFile(initialData.document_url)} sx={{ cursor: 'pointer' }}>(Current)</Link>
      )}</InputLabel>
      <input
        type="file"
        name="nic"
        accept="application/pdf,image/*"
        onChange={e => setNic(e.target.files[0])}
        style={{ marginBottom: 16 }}
      />
      <InputLabel sx={{ mb: 1 }}>Policy Document {isEdit && initialData.policy_url && (
        <Link onClick={() => openFile(initialData.policy_url)} sx={{ cursor: 'pointer' }}>(Current)</Link>
      )}</InputLabel>
      <input
        type="file"
        name="policy"
        accept="application/pdf,image/*"
        onChange={e => setPolicy(e.target.files[0])}
        style={{ marginBottom: 16 }}
      />
      {error && <Typography color="error">{error}</Typography>}
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained">{isEdit ? 'Update' : 'Submit'}</Button>
      </Box>
    </Box>
  );
};

export default ClientForm; 