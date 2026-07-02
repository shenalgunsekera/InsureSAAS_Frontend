import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../firebase';
import { PRODUCTS } from '../config/products';
import { generateComparisonPdf } from '../utils/comparisonPdf';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';

const ComparisonPdfPage = () => {
  const [params]   = useSearchParams();
  const qid        = params.get('qid');
  const [status,   setStatus]  = useState('loading'); // loading | ready | error
  const [error,    setError]   = useState('');
  const [quote,    setQuote]   = useState(null);
  const [productDef, setProductDef] = useState(null);

  useEffect(() => {
    if (!qid) { setError('Invalid link — missing quote ID.'); setStatus('error'); return; }
    signInAnonymously(auth)
      .catch(() => {})
      .finally(() => {
        getDoc(doc(db, 'quotes', qid))
          .then(snap => {
            if (!snap.exists()) { setError('Quote not found.'); setStatus('error'); return; }
            const data = snap.data();
            // Strip broker-only commission fields before the customer page uses the
            // data, so commission can never reach a customer-facing render.
            const COMMISSION_KEYS = ['commission_type','commission_basic','commission_srcc',
              'commission_tc','commission_total','commission_pct','commission_special_rate',
              'commission_special_amount','commission_amount_paid','commission_vat'];
            const cleanResponses = (data.responses || []).map(r => {
              const c = { ...r }; COMMISSION_KEYS.forEach(k => delete c[k]); return c;
            });
            setQuote({ id: snap.id, ...data, responses: cleanResponses });
            // Resolve product definition (static or custom)
            const pKey = data.product_key;
            if (PRODUCTS[pKey]) {
              setProductDef(PRODUCTS[pKey]);
            } else if (pKey) {
              getDoc(doc(db, 'products', pKey))
                .then(ps => { if (ps.exists()) setProductDef(ps.data()); })
                .catch(() => {});
            }
            setStatus('ready');
          })
          .catch(() => { setError('Failed to load quote.'); setStatus('error'); });
      });
  }, [qid]);

  const generateAndDownload = async () => {
    setStatus('generating');
    try {
      await generateComparisonPdf({
        quote,
        product: productDef || null,
        responses: quote.responses || [],
        audience: 'customer',
      });
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError('Failed to generate PDF. Please try again.');
      setStatus('error');
    }
  };

  // Auto-trigger download once quote is loaded
  useEffect(() => {
    if (status === 'ready') generateAndDownload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Box sx={{ minHeight:'100vh', bgcolor:'#F9F9FB', display:'flex', alignItems:'center', justifyContent:'center', p:3 }}>
      <Box sx={{ maxWidth:440, width:'100%', textAlign:'center' }}>

        <Box sx={{ width:64, height:64, borderRadius:'16px', mx:'auto', mb:2, background:'linear-gradient(135deg,#1A1A2E,#374151)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30 }}>
          📄
        </Box>

        <Typography variant="h5" sx={{ fontWeight:800, mb:0.5 }}>
          {status === 'generating' ? 'Generating Your PDF…' :
           status === 'done'       ? 'PDF Downloaded!' :
           status === 'error'      ? 'Something went wrong' :
           'Preparing Comparison PDF'}
        </Typography>
        <Typography sx={{ color:'#6B7280', fontSize:13, mb:3 }}>
          InsureSAAS Insurance Brokers — {quote?.reference || '…'}
        </Typography>

        {(status === 'loading' || status === 'generating') && (
          <CircularProgress sx={{ color:'#FF5A5A', mb:2 }} />
        )}

        {status === 'error' && (
          <>
            <Alert severity="error" sx={{ mb:2, textAlign:'left' }}>{error}</Alert>
            <Button variant="contained" onClick={() => window.location.reload()}
              sx={{ background:'linear-gradient(135deg,#FF5A5A,#FF8B5A)' }}>
              Try Again
            </Button>
          </>
        )}

        {status === 'done' && (
          <>
            <Alert severity="success" sx={{ mb:2, textAlign:'left' }}>
              Your comparison PDF has been downloaded successfully.
            </Alert>
            <Button variant="outlined" onClick={generateAndDownload}
              sx={{ borderColor:'rgba(255,90,90,0.3)', color:'#FF5A5A' }}>
              Download Again
            </Button>
          </>
        )}

        <Typography sx={{ fontSize:11.5, color:'#9CA3AF', mt:3 }}>
          InsureSAAS Insurance Brokers (Pvt) Ltd — Confidential Quotation Portal
        </Typography>
      </Box>
    </Box>
  );
};

export default ComparisonPdfPage;
