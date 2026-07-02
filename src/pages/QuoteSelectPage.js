import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../firebase';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const QuoteSelectPage = () => {
  const [params] = useSearchParams();
  const qid         = params.get('qid');
  const companyId   = params.get('cid');
  const companyName = params.get('cn') ? decodeURIComponent(params.get('cn')) : 'the selected insurer';

  const [loading,         setLoading]         = useState(true);
  const [confirming,      setConfirming]       = useState(false);
  const [confirmed,       setConfirmed]        = useState(false);
  const [alreadySelected, setAlreadySelected]  = useState(null);
  const [quote,           setQuote]            = useState(null);
  const [error,           setError]            = useState('');

  useEffect(() => {
    if (!qid || !companyId) { setError('Invalid link — missing parameters.'); setLoading(false); return; }
    signInAnonymously(auth)
      .catch(() => {})
      .finally(() => {
        getDoc(doc(db, 'quotes', qid))
          .then(snap => {
            if (!snap.exists()) { setError('This quotation could not be found.'); return; }
            const data = snap.data();
            setQuote({ id: snap.id, ...data });
            if (data.customer_selection) setAlreadySelected(data.customer_selection);
          })
          .catch(() => setError('Failed to load quotation. Please check your link.'))
          .finally(() => setLoading(false));
      });
  }, [qid, companyId]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'quotes', qid), {
        customer_selection: {
          company_id:   companyId,
          company_name: companyName,
          selected_at:  new Date().toISOString(),
        },
      });
      setConfirmed(true);
    } catch (err) {
      setError(err.message);
    }
    setConfirming(false);
  };

  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <CircularProgress sx={{ color: '#FF5A5A' }} />
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F9F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Box sx={{ maxWidth: 480, width: '100%' }}>

        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '16px', mx: 'auto', mb: 2,
            background: 'linear-gradient(135deg,#FF5A5A,#FF8B5A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
          }}>🏆</Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Select Your Insurer</Typography>
          <Typography sx={{ color: '#6B7280', fontSize: 13, mt: 0.5 }}>
            InsureSAAS Insurance Brokers · Ref: {quote?.reference}
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Card sx={{ overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>

            {confirmed ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <CheckCircleIcon sx={{ fontSize: 60, color: '#10B981', mb: 2 }} />
                <Typography sx={{ fontWeight: 800, fontSize: 20, mb: 1.5 }}>Selection Confirmed!</Typography>
                <Typography sx={{ color: '#4B5563', fontSize: 14, lineHeight: 1.7 }}>
                  You have selected <strong>{companyName}</strong> as your preferred insurer for{' '}
                  <strong>{quote?.product_label}</strong>.<br />
                  InsureSAAS Insurance Brokers will be in touch shortly to proceed with your policy.
                </Typography>
              </Box>

            ) : alreadySelected ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                {alreadySelected.company_id === companyId ? (
                  <>
                    <CheckCircleIcon sx={{ fontSize: 48, color: '#10B981', mb: 2 }} />
                    <Typography sx={{ fontWeight: 700, fontSize: 17, mb: 1 }}>
                      Already selected {alreadySelected.company_name}
                    </Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                      Your selection has been recorded. Our team will contact you shortly.
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontWeight: 700, fontSize: 17, mb: 1.5, color: '#374151' }}>
                      You have already made a selection
                    </Typography>
                    <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', mb: 2 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#059669' }}>
                        {alreadySelected.company_name}
                      </Typography>
                      <Typography sx={{ color: '#6B7280', fontSize: 12 }}>
                        Selected on {new Date(alreadySelected.selected_at).toLocaleString('en-GB')}
                      </Typography>
                    </Box>
                    <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                      To change your selection, please contact InsureSAAS Insurance Brokers directly.
                    </Typography>
                  </>
                )}
              </Box>

            ) : (
              <Stack spacing={2.5}>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#374151' }}>
                  You are about to select:
                </Typography>
                <Box sx={{ p: 2.5, borderRadius: '12px', bgcolor: 'rgba(255,90,90,0.05)', border: '1px solid rgba(255,90,90,0.18)', textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 22, color: '#FF5A5A' }}>{companyName}</Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: 13, mt: 0.3 }}>{quote?.product_label}</Typography>
                </Box>
                <Typography sx={{ color: '#6B7280', fontSize: 13, lineHeight: 1.7 }}>
                  By confirming, you notify InsureSAAS Insurance Brokers of your preferred insurer.
                  They will contact you to complete the policy issuance.
                </Typography>
                <Button fullWidth variant="contained" onClick={handleConfirm} disabled={confirming}
                  sx={{ py: 1.4, fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg,#FF5A5A,#FF8B5A)' }}>
                  {confirming ? 'Confirming…' : `Confirm — Go with ${companyName}`}
                </Button>
              </Stack>
            )}

          </CardContent>
        </Card>

        <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', mt: 3 }}>
          InsureSAAS Insurance Brokers (Pvt) Ltd — Confidential Quotation Portal
        </Typography>
      </Box>
    </Box>
  );
};

export default QuoteSelectPage;
