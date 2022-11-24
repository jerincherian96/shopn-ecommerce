var express = require('express');
const { response } = require('../app');
var router = express.Router();
var productHelper=require('../helpers/product-helpers')
var userHelper=require('../helpers/user-helpers')
var paypal = require('paypal-rest-sdk');
const { Db } = require('mongodb');

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN 
const serviceId =process.env.TWILIO_SERVICE_ID
const client = require('twilio')(accountSid, authToken); 

paypal.configure({
  'mode': 'sandbox', //sandbox or live 
  'client_id':process.env.PAYPAL_CLIENT_ID, 
  'client_secret': process.env.PAYPAL_CLIENT_SECRET 
});


const verifyUserLogin=(req,res,next)=>{
  if (req.session.user) {
    next()
  }else{
    res.redirect('/userlogin')
  }
}

router.get('/',(req,res)=>{
  let cartCount=null
   let wishCount=null
  productHelper.getAllCategory().then(async(AllCategory)=>{

    if (req.session.user) { 
      wishCount=await userHelper.getWishCount(req.session.user._id)   
      cartCount=await userHelper.getCartCount(req.session.user._id)
      banner=await userHelper.getbanner()
      console.log("after userHelper.getbanner in user .js");
      productHelper.getAllProduct().then((products)=>{
        res.render('user/index',{profile:true,products,AllCategory,cartCount,wishCount,banner})
      })
    } else {
      banner=await userHelper.getbanner()
      console.log("getbanner ----else--home page--");
      productHelper.getAllProduct().then((products)=>{
        res.render('user/index',{products,AllCategory,banner})
      })
    }  
  })

})

router.get('/userlogin',(req, res)=>{
  if (req.session.user) {
    res.redirect("/");
  } else {
    res.render('user/userlogin', {log:true,loginErr: req.session.loginErr,Error: req.session.isBlockedError}); 
    req.session.isBlockedError=null
    req.session.loginErr = null;
  }
});

router.post('/userlogin',(req,res)=>{    
  userHelper.doLogin(req.body).then((response) => {  
    if(response.user){
      userHelper.isBlocked(response.user._id).then(()=>{
        if (response.status) {    
          req.session.user = response.user;
          res.redirect("/");
        } else {
          req.session.loginErr = "Enter valid username and password";
          res.redirect("/userlogin");
        }        
      }).catch((error)=>{
          req.session.isBlockedError=error
          res.redirect('/userlogin')
      })
    }else{
      req.session.loginErr = "Enter valid username and password";
      res.redirect("/userlogin");
    }
  })      
})     

router.get('/usersignup',(req,res)=>{
  if (req.session.user) {
    res.redirect("/");
  } else {
    res.render("user/usersignup", {
      log: true,
      emailErr: req.session.emailErr,
      phoneErr:req.session.phoneErr,
      referralErr:req.session.referralErr
    }); 
    req.session.emailErr=null
    req.session.phoneErr = null;
    req.session.referralErr=null
  }
})

router.post('/usersignup',(req,res)=>{
    referral=req.body.referral
    userHelper.doSignup(req.body).then(async(response) => {
      if(response.exist1){
        req.session.emailErr='email already exist'
        res.redirect('/usersignup')
      }else if(response.exist2){
        req.session.phoneErr='phone number already exist'
        res.redirect('/usersignup')
      }else if(response.referralWrong){
        req.session.referralErr="Invalid Referral Code"
        res.redirect('/usersignup')
      }else {
        req.session.user=response.user
        if(referral){
          await userHelper.update100(referral,req.body.name)
          await userHelper.update50(req.session.user._id)
        }
        res.redirect("/");
      }
    });
})

router.get('/productdetails/:id',(req,res)=>{
  let cartCount=null
  let itemIsThere
  let stockNull
  let stockFive
  productHelper.getAllCategory().then(async(AllCategory)=>{
    productHelper.getProductDetails(req.params.id).then(async(product)=>{
      if(product.stock===0){
        stockNull=true
      }else if(product.stock<=5){
        stockFive=true
      }

  if(req.session.user){
    let userid=req.session.user._id
    cartCount=await userHelper.getCartCount(userid)
      let checkCart=await userHelper.checkCart(userid,req.params.id)
      if(checkCart.itemIsThere){
        itemIsThere=true
      }else{
        itemIsThere=false
      } 
  }else{     
  }
  res.render('user/product-details',{profile:true,product,AllCategory,cartCount,itemIsThere,stockNull,stockFive})
})
  })
})

router.get('/category/:cat',(req,res)=>{
  let cartCount=null
  productHelper.getAllCategory().then(async(AllCategory)=>{
  if (req.session.user) {
    cartCount=await userHelper.getCartCount(req.session.user._id)
    productHelper.getProductsInCategory(req.params.cat).then((products)=>{
      res.render('user/category',{profile:true,products,AllCategory,cartCount})
    })
  } else {
    productHelper.getProductsInCategory(req.params.cat).then((products)=>{
      res.render('user/category',{products,AllCategory})
    })
  }
})
})

router.get('/otplogin',(req,res)=>{
  if (req.session.user) {
    res.redirect("/");
  } else {
    res.render('user/otplogin',{
      log:true,
      numberError:req.session.numberExist,
      otpSended:req.session.otpSended,
      otpError:req.session.otpError,
    })
    console.log(req.session.otpSended);
    req.session.numberExist=null
    req.session.otpError=null
  }
})
router.post('/send-otp',(req,res)=>{
  userHelper.checkMobileNumber(req.body).then((response)=>{
    if(response.exist){
      let mobileNumber=(`+91${req.body.phone}`)
      req.session.Phoneno=mobileNumber
      client.verify.v2.services(serviceId)
      .verifications
      .create({to: mobileNumber, channel: 'sms'})
      .then((verification) => {
      console.log(verification.status);
      req.session.otpSended=true
      req.session.userPre=response
      res.redirect('/otplogin')
      })
    }else{
      req.session.numberExist="Phone number has not been registered or user does not exist."
      res.redirect('/otplogin')
    }
  })
})
router.post('/verifyotp',(req,res)=>{
  let mobileNumber=req.session.Phoneno
  let otp=req.body.otp
  client.verify.v2.services(serviceId)
      .verificationChecks
      .create({to: mobileNumber, code: otp})
      .then((verification_check) => {
        console.log(verification_check.status)
        if(verification_check.status=='approved'){
          req.session.user=req.session.userPre
          req.session.otpSended=null
          res.redirect('/')
        }else{
          req.session.otpSended=true
          req.session.otpError="Invalid otp"
          res.redirect('/otplogin')
        }
      })

})

router.get('/hai',(req,res)=>{
  res.render('user/hai',{log:true})
})


router.get('/cart',verifyUserLogin,async(req,res)=>{
  let userId=req.session.user._id
  productHelper.getAllCategory().then(async(AllCategory)=>{
      userHelper.getCartProducts(userId).then(async(products)=>{
        let totalAmount=await userHelper.getTotalAmount(userId)
        if(products){ 
          res.render('user/cart',{profile:true,products,user:req.session.user,totalAmount,AllCategory})  //og code
        }else{
          res.render('user/cart',{profile:true,AllCategory})
        } 
      }) 
  })
  
})
router.post('/cart',(req,res)=>{
  req.session.buynow=null
  res.redirect('/place-order')
})
router.get('/add-to-cart/:id',verifyUserLogin,(req,res)=>{
    product=req.params.id
    userHelper.addToCart(req.params.id,req.session.user._id).then(async()=>{
      let totalOne=await userHelper.getTotalOfOneProduct(req.session.user._id,product)
      let details={}
      details.product=product
      await userHelper.updateOneProductTotal(req.session.user._id,details,totalOne)
      res.redirect('/cart')
    })
})
router.get('/buy-now/:id',verifyUserLogin,(req,res)=>{
    req.session.proId=req.params.id
    userHelper.addToCart(req.params.id,req.session.user._id).then(()=>{
      req.session.buynow=true
      res.redirect('/place-order')     
    })
})

router.post('/change-product-quantity',(req,res)=>{
  userHelper.changeProductQuantity(req.body).then(async(response)=>{
   if(response.stockEmpty){
     res.json(response)
   }else{
      response.totalAmount=await userHelper.getTotalAmount(req.body.user)
      response.totalOne=await userHelper.getTotalOfOneProduct(req.body.user,req.body.product)
      let totalOne=response.totalOne
      await userHelper.updateOneProductTotal(req.session.user._id,req.body,totalOne)
       res.json(response)
   }
  })
})

router.post('/remove-item',(req,res)=>{
  userHelper.removeItem(req.body).then((response)=>{
    res.json(response)
  })
})

router.get('/place-order',verifyUserLogin,async(req,res)=>{
  productHelper.getAllCategory().then(async(AllCategory)=>{
    let products
    let totalAmount
    let userId=req.session.user._id
    if(req.session.buynow){
      proId=req.session.proId
      let productPrice=await userHelper.fetchProductPrice(proId)
      await userHelper.updateQuantityAndPriceBuyNow(userId,productPrice,proId)
      products=await userHelper.getOneCartProduct(userId,proId)
      totalAmount=await userHelper.getTotalOfOneProduct(userId,proId)
    }else{
      products=await userHelper.getCartProducts(userId)
      totalAmount=await userHelper.getTotalAmount(userId)
    }

      if(products){ 
        let addresses=await userHelper.getAddresses(userId)
        let checkBalance=await userHelper.CheckWalletBalance(userId,totalAmount)
        if(checkBalance.insufficient){
           insufficient=true
        }else{
           insufficient=false
        }
        let coupon=await userHelper.getCoupon()

        if(req.session.newTotal){
          oldTotal=totalAmount
          totalAmount=req.session.newTotal
          percAmount=req.session.percAmount
          req.session.postNewTotal=req.session.newTotal
        }else{
          percAmount=0
          oldTotal=0
        }

        res.render('user/userorder',{
          profile:true,
          products,
          user:req.session.user,
          totalAmount,
          addresses,
          AllCategory,
          insufficient,
          coupon,
          couponMsgGreen:req.session.couponMsgGreen,
          couponName:req.session.couponName,
          couponMsgRed:req.session.couponMsgRed,
          notApplicable:req.session.coupenNotApplicable,
          percAmount,
          oldTotal
        })
        req.session.couponMsgGreen=null
        req.session.couponName=null
        req.session.couponMsgRed=null
        req.session.coupenNotApplicable=null
        req.session.appliedPercentage=null
        req.session.newTotal=null   
      }else{
        res.redirect('/')
        req.session.catchErr=null
      }
    })
})
router.post('/place-order',async(req,res)=>{
  userId=req.session.user._id
  let buynow
  let products
  let totalPrice
  if(req.session.buynow){
    buynow=req.session.buynow
    proId=req.session.proId
     products=await userHelper.getCartOneProductList(userId,proId)
     totalPrice=await userHelper.getTotalOfOneProduct(userId,proId)
  }else{
     products=await userHelper.getCartProductList(userId)
     totalPrice=await userHelper.getTotalAmount(userId)
  }

  if(req.session.postNewTotal){
    totalPrice=req.session.postNewTotal
  }

    userHelper.placeOrder(req.body,userId,products,totalPrice,buynow).then(async(orderId)=>{
      req.session.postNewTotal=null
      req.session.paymentStatus=false
      if(req.body.paymentMethod==='COD'){
        req.session.newTotal=null
        req.session.paymentStatus=true
        res.json({codSuccess:true})
      }else if(req.body.paymentMethod==='WALLET'){
        await userHelper.reduceFromWallet(userId,totalPrice,orderId)
        req.session.newTotal=null
        req.session.paymentStatus=true
        res.json({walletSuccess:true})
      }
      else if(req.body.paymentMethod==='PAYPAL'){

      console.log("Entered in  req.body.paymentMethod paypal");
          // create payment object 
          var payment = {
          "intent": "authorize",
          "payer": {
          "payment_method": "paypal"
          },
          "redirect_urls": {
          "return_url": "http://localhost:3000/status-page",
          "cancel_url": "http://localhost:3000/place-order"
          },
          "transactions": [{
          "amount": {   
            "currency": "USD",
             "total": totalPrice
          },
          "description": ""
          }]
          }


        // call the create Pay method 
        userHelper.createPay( payment ) 
          .then( ( transaction ) => {
              var id = transaction.id; 
              var links = transaction.links;
              var counter = links.length; 
              while( counter -- ) {
                  if ( links[counter].rel === 'approval_url') {     //  if ( links[counter].method == 'REDIRECT') {  
            // redirect to paypal where user approves the transaction 
                      // res.json({paypalsuccess:true})  ///i added
                      console.log(links[counter].href);
                      // return res.redirect( links[counter].href ) 
                      transaction.paypalsuccess=true
                      transaction.directionlink=links[counter].href
                      transaction.orderId=orderId
                      console.log(payment)
                      req.session.newTotal=null
                      res.json(transaction)
                       
                  }
              }
          })
          .catch( ( err ) => { 
              console.log( err ); 
              req.session.catchErr="Payment page loading error"
              req.session.newTotal=null
              res.redirect('/place-order');
          });
    }else if(req.body.paymentMethod==='RAZORPAY'){
      console.log("Entered in razorpay userjs");

       userHelper.generateRazorpay(orderId,totalPrice).then((response)=>{
        response.razorpaysuccess=true
        req.session.newTotal=null
        res.json(response)
       })
    }
    
  })
})

router.get('/status-page',verifyUserLogin,(req,res)=>{
  if(req.session.paymentStatus!=null){
    res.render('user/status-page',{profile:true,paymentStatus:req.session.paymentStatus})
    req.session.paymentStatus=null
  }else{
    res.redirect('/')
  }
   
})
router.get('/view-orders',verifyUserLogin,(req,res)=>{
  productHelper.getAllCategory().then(async(AllCategory)=>{
      userHelper.getOrders(req.session.user._id).then(async(order)=>{
        res.render('user/view-orders',{profile:true,order,AllCategory})
      })
  })
})
router.get('/view-order-products/:id',verifyUserLogin,async(req,res)=>{
  let pending
  let placed
  let shipped
  let delivered
  let cancelled
  let returned
  buynow=req.session.buynow
  let orderData=await userHelper.getOrderAddressDetails(req.params.id)
  let orders=await userHelper.getOrderProducts(req.params.id)
  if(orderData.status==='Pending'){
    pending=true
  }else if(orderData.status==='Placed'){
    pending=true
    placed=true
  }else if(orderData.status==='Shipped'){
    pending=true
    placed=true
    shipped=true
  }else if(orderData.status==='Delivered'){
    pending=true
    placed=true
    shipped=true
    delivered=true
  }else if(orderData.status==='Cancelled'){
    cancelled=true
  }else if(orderData.status==='Returned'){
    returned=true
  }
  res.render('user/orderproducts',{
    profile:true,
    user:req.session.user,
    orders,
    buynow,orderData,
    pending,
    placed,
    shipped,
    delivered,
    cancelled,
    returned
  })
})

router.post('/order-return',(req,res)=>{
  let userId=req.session.user._id
  userHelper.returnOrder(req.body,userId).then(async(response)=>{
    let data={}
    data.returnTrue=true
    await userHelper.refundAmount(userId,req.body,data)
    data.returnTrue=false
    res.json(response)
  })
})
router.post('/order-cancel',(req,res)=>{
  let userId=req.session.user._id
  userHelper.cancelOrder(req.body).then(async(response)=>{
    let data={}
    data.cancelTrue=true
    await userHelper.refundAmount(userId,req.body,data)
    data.cancelTrue=false
    res.json(response)
  })
})

router.post('/verify-payment',(req,res)=>{
  userHelper.verifyPayment(req.body).then(()=>{
    userHelper.changeOnlinePaymentStatus(req.body['order[receipt]']).then(()=>{
      console.log("Payment successfull")
      req.session.paymentStatus=true
      res.json({status:true})
    })
  })
  .catch((err)=>{
    console.log(err);
    res.json({status:false,errMsg:''})
  })
})



router.get('/profile',verifyUserLogin,(req,res)=>{
  productHelper.getAllCategory().then(async(AllCategory)=>{
      userId=req.session.user._id
      userHelper.getOneUser(userId).then(async(singleUser)=>{
        let referral=await userHelper.getreferralCode(userId)
        let referralCode=referral.referralCode
        res.render('user/profile',{AllCategory,profile:true,singleUser,referralCode})
      })
  })
  
})
router.post('/profile',(req,res)=>{
  userId=req.session.user._id
  userHelper.updateUser(userId,req.body).then(()=>{
    res.redirect('/profile')
  })
})
router.get('/change-password',verifyUserLogin,(req,res)=>{
  productHelper.getAllCategory().then(async(AllCategory)=>{
      res.render('user/change-password',{
        AllCategory,
        passwordExist:req.session.passwordExist,
        passwordErr:req.session.passwordErr,
        profile:true
      })
      req.session.passwordExist=null
      req.session.passwordErr=null
  })
  
})
router.post('/change-password',(req,res)=>{
  userId=req.session.user._id
  userHelper.checkPassword(userId,req.body).then((response)=>{
    if(response.status){
      if(response.data){
        req.session.passwordErr="Password must be different from the password used before"
        res.redirect('/change-password')
      }else{
        res.redirect('/change-password')
      }
      
    }else{
      req.session.passwordExist="Incorrect old password"
      res.redirect('/change-password')
    }
  })
})

router.post('/paypal-status',(req,res)=>{
  userHelper.changeOnlinePaymentStatus(req.body.order).then(()=>{
    req.session.paymentStatus=true
    res.json({status:true})
  })
})

router.get('/manage-addresses',verifyUserLogin,(req,res)=>{
  productHelper.getAllCategory().then(async(AllCategory)=>{
      userId=req.session.user._id
       let addresses=await userHelper.getAddresses(userId)
       let referral=await userHelper.getreferralCode(userId)
       let referralCode=referral.referralCode
      userHelper.getOneUser(userId).then((singleUser)=>{
        res.render('user/manage-addresses',{profile:true,AllCategory,addresses,singleUser,referralCode})
      })
        
  })
  
})
router.post('/manage-addresses',(req,res)=>{
  userId=req.session.user._id
  userHelper.addAddress(userId,req.body).then(()=>{
    res.redirect('/manage-addresses')
  })
})
router.post('/add-address',(req,res)=>{
  userId=req.session.user._id
  userHelper.addAddress(userId,req.body).then(()=>{
    res.redirect('/place-order')
  })
})
router.get('/wallet',verifyUserLogin,async(req,res)=>{
  productHelper.getAllCategory().then(async(AllCategory)=>{
   userHelper.getWalletInfo(req.session.user._id).then((wallet)=>{
      res.render('user/wallet',{profile:true,wallet,AllCategory})
    })
  })
})
router.post('/coupon-verify',(req,res)=>{
  let coupon=req.body.coupon
  let userId=req.session.user._id
  let proId=req.session.proId
  userHelper.verifyCoupon(coupon).then(async(response)=>{
    if(response.couponVerified){
      req.session.coupon=response
      let couponAmount=response.minAmount
      let perc=response.percentage
      
      if(req.session.buynow){
        totalAmount=await userHelper.getTotalOfOneProduct(userId,proId)
      }else{
        totalAmount=await userHelper.getTotalAmount(userId)
      }
      if(totalAmount>=couponAmount){
        req.session.couponName=coupon
        let percentageAmount=totalAmount*(perc/100)
        let percAmount=Math.round(percentageAmount)
        let newTotal=totalAmount-percAmount
        req.session.newTotal=newTotal
        req.session.percAmount=percAmount
        req.session.couponMsgGreen=" - Coupon Applied Successfully"
      }else{
        req.session.coupenNotApplicable="Coupon is not applicable!"
      }
      res.json(response)
    }else{
      req.session.couponMsgRed="Invalid Coupon !"
      res.json(response)
    }
  })
})
router.post('/remove-address',(req,res)=>{
  addressId=req.body.address
  userId=req.session.user._id
  userHelper.removeAddress(addressId,userId).then((response)=>{
    res.json(response)
  })
})
router.get('/view-invoice/:id',verifyUserLogin,(req,res)=>{
  let orderId=req.params.id
  userHelper.getOrderForInvoice(orderId).then(async(productsData)=>{
    let orderData=await userHelper.getOrderAddressDetails(orderId)
    res.render('user/view-invoice',{profile:true,productsData,orderData})
  })
})
router.post('/edit-Address',(req,res)=>{
  let userId=req.session.user._id
  userHelper.updateAddress(userId,req.body).then(()=>{
    res.redirect('/manage-addresses')
  })
})
router.post('/edit-Address-order',(req,res)=>{
  let userId=req.session.user._id
  userHelper.updateAddress(userId,req.body).then(()=>{
    res.redirect('/place-order')
  })
})

router.get('/search',(req,res)=>{
  let key=req.query.search
  productHelper.getAllCategory().then(async(AllCategory)=>{
    if(req.session.user){
      productHelper.searchInProducts(key).then((products)=>{
        res.render('user/searched-products',{profile:true,products,AllCategory,key})
        key=null
      })
    }else{
      productHelper.searchInProducts(key).then((products)=>{
        res.render('user/searched-products',{products,AllCategory,key})
        key=null
      })
    }
  }) 
})

router.post('/add-to-wishlist',verifyUserLogin,(req,res)=>{
    product=req.body.wish
    console.log("product id----");
    console.log(product);
    userHelper.addToWishlist(product,req.session.user._id).then(()=>{
      res.redirect('/')
    })
})
router.get('/wishlists',verifyUserLogin,(req,res)=>{
  let userId=req.session.user._id
  userHelper.getWishList(userId).then((products)=>{
    res.render('user/wishlist',{products,profile:true,user:true})
  })
})


router.post('/remove-wish',(req,res)=>{
  userHelper.removeWish(req.body).then((response)=>{
    res.json(response)
  })
})




router.get('/userlogout',(req,res)=>{
  req.session.user=null
  req.session.userPre=null 
  res.redirect('/')
})
module.exports = router;





