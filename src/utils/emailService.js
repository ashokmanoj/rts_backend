'use strict';

const nodemailer = require('nodemailer');
const path = require('path');
const { readFile, instantiateFromTemplate } = require('./mailUtils');
const config = require('./mailConfig');

const sendPasswordResetEmail = async (email, userName, token) => {
  const fullName = userName || 'User';
  const name = 'RTS'; // System name

  let link = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  let htmlFile = path.join(__dirname, 'ResetPassword.html');
  let contents = readFile(htmlFile);
  let html = instantiateFromTemplate(contents, {fullName, link, expiry: 60, name});
  
  let transporter = nodemailer.createTransport(config.mailer);
  let mailOptions = {
    from: config.mailUser.email,
    to: email,
    subject: name + ' -- Password Recovery',
    html
  };
  
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.log('Email send unsuccesful', err.message);
        reject(err);
      }
      else {
        console.log('Email sent: ' + info.response);
        resolve(info);
      }
    });
  });
};

module.exports = {
  sendPasswordResetEmail
};
