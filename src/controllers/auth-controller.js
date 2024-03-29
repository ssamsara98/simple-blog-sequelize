'use strict';
const express = require('express');
const createHttpError = require('http-errors');

const { comparePassword } = require('../helpers/hash-helper');
const { signPayload } = require('../helpers/jwt-helper');
const db = require('../models');

module.exports = class AuthController {
  static async register(req = express.request, res = express.response, next) {
    const { email, password, name, birthdate } = req.body;
    const t = await db.sequelize.transaction();
    try {
      const isEmailExist = await db.User.findOne({ where: { email } });
      if (isEmailExist) return next(createHttpError(409, 'Email already exists!'));
      const newUser = await db.User.create(
        { email, password, profile: { name, birthdate } },
        { include: { model: db.UserProfile, as: 'profile' }, transaction: t },
      );
      await t.commit();
      return res.json(newUser);
    } catch (err) {
      t.rollback();
      next(err);
    }
  }

  static async login(req = express.request, res = express.response, next) {
    try {
      const { email, password } = req.body;
      const user = await db.User.findOne({
        where: { email },
        include: { model: db.UserProfile, as: 'profile' },
        attributes: {
          include: 'password',
        },
      });
      if (!user) return next(createHttpError(400, 'Email or Password is invalid'));

      const isMatch = await comparePassword(password, user.password);
      if (!isMatch) return next(createHttpError(400, 'Email or Password is invalid'));

      const payload = { sub: user.id, email: user.email };
      const token = signPayload(payload);

      const user_info = user.toJSON();
      delete user_info.password;

      res.cookie('access_token', token, {
        signed: true,
        httpOnly: true,
        maxAge: 1000 * 60 * 60,
        sameSite: 'lax',
        secure: process.env.NODE_ENV !== 'development',
      });
      return res.json({ user_info });
    } catch (err) {
      return next(err);
    }
  }
};
